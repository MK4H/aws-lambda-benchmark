#!/bin/bash

cd "$( dirname "${BASH_SOURCE[0]}" )" &&
    cd "${DIR}/DotnetLambdaBenchmark/src/DotnetLambdaBenchmark" &&
    dotnet lambda package