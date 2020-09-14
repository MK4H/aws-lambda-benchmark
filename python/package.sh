#!/bin/bash

cd "$( dirname "${BASH_SOURCE[0]}" )" &&
    zip -r9 package.zip ./venv/lib/python3.8/site-packages &&
    zip -g package.zip *.py