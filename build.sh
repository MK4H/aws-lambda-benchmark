#!/bin/bash

# C#

(
    cd ./csharp/DotnetLambdaBenchmark/src/DotnetLambdaBenchmark &&
    dotnet publish -c Release
)

# Go

(
    cd ./go &&
    go get github.com/aws/aws-lambda-go/lambda &&
    GOOS=linux go build main.go
)

# Java

(
    cd ./java &&
    ./gradlew buildZip
)

# Python

# No build needed

# Typescript

(
    cd ./typescript &&
    npm run build
)