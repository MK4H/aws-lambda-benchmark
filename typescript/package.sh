#/bin/bash

cd "$( dirname "${BASH_SOURCE[0]}" )" &&
    zip package.zip -j publish/handler.js