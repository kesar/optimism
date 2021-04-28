# build in 2 steps
function build_images() {
    docker-compose build --parallel -- builder l2geth l1_chain
    docker-compose build --parallel -- deployer dtl batch_submitter relayer
}

build_images &

wait
