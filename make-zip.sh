#!/bin/zsh

TARGET=amazon-beancount.zip

if [[ -e ${TARGET} ]]; then
    rm ${TARGET}
fi

zip ${TARGET} *.js *.html manifest.json icon.svg
