#!/bin/bash
set -eu
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

node $DIR/ic -o $DIR/test/genmidi $DIR/test/genmidi.inst

# node midicvt --blank $DIR/n64daw/public/b1n12ft.mid
node $DIR/midicvt --gm $DIR/n64daw/public/b1n12ft.mid --out $DIR/test/tst.seq
# node $DIR/midicvt --gm $DIR/n64daw/iwantitthatway.mid --out $DIR/test/tst.seq
node $DIR/sbc $DIR/test/tst.seq -o $DIR/test/tst.sbk 
cp $DIR/test/tst.sbk $DIR/n64daw/sgisoundtest/tst.sbk 
