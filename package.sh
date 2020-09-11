#!/bin/bash

# C#

(
    cd ./csharp/DotnetLambdaBenchmark/src/DotnetLambdaBenchmark &&
    dotnet lambda package
)

# Go

(
    cd ./go &&
    zip package.zip main
)

# Java

# Already created during build

# Python

(
    cd ./python &&
    zip -r9 package.zip ./venv/lib/python3.8/site-packages &&
    zip -g package.zip *.py
)

# Typescript

(
    cd ./typescript &&
    zip package.zip ./publish/handler.js
)