#!/bin/bash

cd "$( dirname "${BASH_SOURCE[0]}" )" &&
    go get github.com/aws/aws-lambda-go/lambda &&
    GOOS=linux go build main.go