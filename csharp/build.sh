#!/bin/bash

cd "$( dirname "${BASH_SOURCE[0]}" )" &&
    cd ./DotnetLambdaBenchmark/src/DotnetLambdaBenchmark &&
    dotnet publish -c Release