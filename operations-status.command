#!/bin/zsh
cd -- "${0:A:h}"
export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:$PATH"
node scripts/ops-status.mjs --logs
printf '\n按回车关闭窗口。'
read -r
