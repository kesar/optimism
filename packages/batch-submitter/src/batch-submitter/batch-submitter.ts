/* External Imports */
import { Contract, Signer, utils, providers } from 'ethers'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import * as ynatm from '@eth-optimism/ynatm'
import { RollupInfo } from '@eth-optimism/core-utils'
import { Logger, Metrics } from '@eth-optimism/common-ts'
import { getContractFactory } from 'old-contracts'

export interface Range {
  start: number
  end: number
}
export interface ResubmissionConfig {
  resubmissionTimeout: number
  minGasPriceInGwei: number
  maxGasPriceInGwei: number
  gasRetryIncrement: number
}

export abstract class BatchSubmitter {
  protected rollupInfo: RollupInfo
  protected chainContract: Contract
  protected l2ChainId: number
  protected syncing: boolean
  protected lastBatchSubmissionTimestamp: number = 0

  constructor(
    readonly signer: Signer,
    readonly l2Provider: providers.JsonRpcProvider,
    readonly minTxSize: number,
    readonly maxTxSize: number,
    readonly maxBatchSize: number,
    readonly maxBatchSubmissionTime: number,
    readonly numConfirmations: number,
    readonly resubmissionTimeout: number,
    readonly finalityConfirmations: number,
    readonly addressManagerAddress: string,
    readonly minBalanceEther: number,
    readonly minGasPriceInGwei: number,
    readonly maxGasPriceInGwei: number,
    readonly gasRetryIncrement: number,
    readonly gasThresholdInGwei: number,
    readonly log: Logger,
    readonly metrics: Metrics
  ) {}

  public abstract _submitBatch(
    startBlock: number,
    endBlock: number
  ): Promise<TransactionReceipt>
  public abstract _onSync(): Promise<TransactionReceipt>
  public abstract _getBatchStartAndEnd(): Promise<Range>
  public abstract _updateChainInfo(): Promise<void>

  public async submitNextBatch(): Promise<TransactionReceipt> {
    if (typeof this.l2ChainId === 'undefined') {
      this.l2ChainId = await this._getL2ChainId()
    }
    await this._updateChainInfo()
    await this._checkBalance()
    this.log.info('Readying to submit next batch...', {
      l2ChainId: this.l2ChainId,
      batchSubmitterAddress: await this.signer.getAddress(),
    })

    if (this.syncing === true) {
      this.log.info(
        'Syncing mode enabled! Skipping batch submission and clearing queue...'
      )
      return this._onSync()
    }
    const range = await this._getBatchStartAndEnd()
    if (!range) {
      return
    }

    return this._submitBatch(range.start, range.end)
  }

  protected async _checkBalance(): Promise<void> {
    const address = await this.signer.getAddress()
    const balance = await this.signer.getBalance()
    const ether = utils.formatEther(balance)
    const num = parseFloat(ether)

    this.log.info('Checked balance', {
      address,
      ether,
    })

    if (num < this.minBalanceEther) {
      this.log.fatal('Current balance lower than min safe balance', {
        current: num,
        safeBalance: this.minBalanceEther,
      })
    }
  }

  protected async _getRollupInfo(): Promise<RollupInfo> {
    return this.l2Provider.send('rollup_getInfo', [])
  }

  protected async _getL2ChainId(): Promise<number> {
    return this.l2Provider.send('eth_chainId', [])
  }

  protected async _getChainAddresses(): Promise<{
    ctcAddress: string
    sccAddress: string
  }> {
    const addressManager = (
      await getContractFactory('Lib_AddressManager', this.signer)
    ).attach(this.addressManagerAddress)
    const sccAddress = await addressManager.getAddress(
      'OVM_StateCommitmentChain'
    )
    const ctcAddress = await addressManager.getAddress(
      'OVM_CanonicalTransactionChain'
    )
    return {
      ctcAddress,
      sccAddress,
    }
  }

  protected _shouldSubmitBatch(batchSizeInBytes: number): boolean {
    const currentTimestamp = Date.now()
    const isTimeoutReached =
      this.lastBatchSubmissionTimestamp + this.maxBatchSubmissionTime <=
      currentTimestamp
    if (batchSizeInBytes < this.minTxSize) {
      if (!isTimeoutReached) {
        this.log.info(
          'Skipping batch submission. Batch too small & max submission timeout not reached.',
          {
            batchSizeInBytes,
            minTxSize: this.minTxSize,
            lastBatchSubmissionTimestamp: this.lastBatchSubmissionTimestamp,
            currentTimestamp,
          }
        )
        return false
      }
      this.log.info('Timeout reached, proceeding with batch submission.', {
        batchSizeInBytes,
        lastBatchSubmissionTimestamp: this.lastBatchSubmissionTimestamp,
        currentTimestamp,
      })
      return true
    }
    this.log.info('Sufficient batch size, proceeding with batch submission.', {
      batchSizeInBytes,
      lastBatchSubmissionTimestamp: this.lastBatchSubmissionTimestamp,
      currentTimestamp,
    })
    return true
  }

  public static async getReceiptWithResubmission(
    txFunc: (gasPrice) => Promise<TransactionReceipt>,
    resubmissionConfig: ResubmissionConfig,
    log: Logger
  ): Promise<TransactionReceipt> {
    const {
      resubmissionTimeout,
      minGasPriceInGwei,
      maxGasPriceInGwei,
      gasRetryIncrement,
    } = resubmissionConfig

    const receipt = await ynatm.send({
      sendTransactionFunction: txFunc,
      minGasPrice: ynatm.toGwei(minGasPriceInGwei),
      maxGasPrice: ynatm.toGwei(maxGasPriceInGwei),
      gasPriceScalingFunction: ynatm.LINEAR(gasRetryIncrement),
      delay: resubmissionTimeout,
    })

    log.debug('Resubmission tx receipt', { receipt })

    return receipt
  }

  private async _getMinGasPriceInGwei(): Promise<number> {
    if (this.minGasPriceInGwei !== 0) {
      return this.minGasPriceInGwei
    }
    let minGasPriceInGwei = parseInt(
      utils.formatUnits(await this.signer.getGasPrice(), 'gwei'),
      10
    )
    if (minGasPriceInGwei > this.maxGasPriceInGwei) {
      this.log.warn(
        'Minimum gas price is higher than max! Ethereum must be congested...'
      )
      minGasPriceInGwei = this.maxGasPriceInGwei
    }
    return minGasPriceInGwei
  }

  protected async _submitAndLogTx(
    txFunc: (gasPrice) => Promise<TransactionReceipt>,
    successMessage: string
  ): Promise<TransactionReceipt> {
    this.lastBatchSubmissionTimestamp = Date.now()
    this.log.debug('Waiting for receipt...')

    const resubmissionConfig: ResubmissionConfig = {
      resubmissionTimeout: this.resubmissionTimeout,
      minGasPriceInGwei: await this._getMinGasPriceInGwei(),
      maxGasPriceInGwei: this.maxGasPriceInGwei,
      gasRetryIncrement: this.gasRetryIncrement,
    }

    const receipt = await BatchSubmitter.getReceiptWithResubmission(
      txFunc,
      resubmissionConfig,
      this.log
    )

    this.log.info('Received transaction receipt', { receipt })
    this.log.info(successMessage)
    return receipt
  }
}
