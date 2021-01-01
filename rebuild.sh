#!/bin/bash
set -eu
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

node $DIR/ic -o test/genmidi test/genmidi.inst

# node midicvt --blank ./n64daw/soundtool-ui/public/b1n12ft.mid
node $DIR/midicvt --gm $DIR/n64daw/iwantitthatway.mid --out $DIR/test/tst.seq
node $DIR/sbc $DIR/test/tst.seq 
cp $DIR/test/tst.sbk $DIR/n64daw/sgisoundtest/tst.sbk 
