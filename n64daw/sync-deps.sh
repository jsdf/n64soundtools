#!/bin/bash

if [[ $2 == 'clobber' ]];then
  # clobber local from upstream
  rm -rf src/flatland/
  cp -a ~/code/flatland/src/ src/flatland/
else
  # sync local and upstream
  rsync -au src/flatland/ ~/code/flatland/src/
  rsync -au ~/code/flatland/src/ src/flatland/
fi