// parser for ic's .inst file format
// after modifying, rebuild with:
// node_modules/.bin/pegjs instparser.pegjs

{
  const utils = require('./instparserutils'); 
}

icDefsRoot = defs:icDefs {
  // get rid of the null at the end
  return defs.filter(Boolean).filter(v => v.type !== 'comment');
}

icDefs
  = ws head:icDef ws tail:icDefs? ws { return [head].concat(tail); }

icDef
  = icObject / Comment

icObject
  = objectType:symbol ws name:symbol ws? begin_object
    members:(
      head:icObjectMember
      tail:(ws m:icObjectMember { return m; })*
      {
        return [head].concat(tail);
      }
    )?
    end_object {
      let membersList = members !== null ? members: [];
      const result = utils.collectMembers(objectType, name, membersList, expected);
      return {type: objectType, name, value: result};
  }
 
symbol "symbol"
  = chars:symbolchar+ { return chars.join(""); }

symbolchar = [_a-zA-Z0-9]

    
icObjectMember
  =  Comment / assignmentMember / assignmentIndexedMember / useMember

useMember
  = "use" ws "(" value:string ")" semicolon {
      return { type: "use", value: value, location: location()  };
    }

assignmentMember
  = name:symbol assigment_separator value:assignmentValue semicolon { 
      return { type: "assignment", name: name, value: value, location: location()  };
    }

assignmentIndexedMember
  = name:symbol ws "[" index:number "]" assigment_separator value:assignmentValue semicolon { 
      return { type: "assignmentIndexed", name: name, index: index, value: value, location: location() };
    }

assignmentValue = number / symbolValue

symbolValue = value:symbol {
  return {type: "symbol", value: value };
}

assigment_separator  = ws "=" ws

semicolon = ws ";"
 
begin_object    = ws "{" ws 
end_object      = ws "}" ws
name_separator  = ws ":" ws
value_separator = ws "," ws

ws "whitespace" = [ \t\n\r]*

// ----- 6. Numbers -----

number "number"
  = minus? int frac? exp? { return parseFloat(text()); }

decimal_point
  = "."

digit1_9
  = [1-9]

e
  = [eE]

exp
  = e (minus / plus)? DIGIT+

frac
  = decimal_point DIGIT+

int
  = zero / (digit1_9 DIGIT*)

minus
  = "-"

plus
  = "+"

zero
  = "0"

// ----- 7. Strings -----

string "string"
  = quotation_mark chars:char* quotation_mark { return chars.join(""); }

char
  = unescaped
  / escape
    sequence:(
        '"'
      / "\\"
      / "/"
      / "b" { return "\b"; }
      / "f" { return "\f"; }
      / "n" { return "\n"; }
      / "r" { return "\r"; }
      / "t" { return "\t"; }
      / "u" digits:$(HEXDIG HEXDIG HEXDIG HEXDIG) {
          return String.fromCharCode(parseInt(digits, 16));
        }
    )
    { return sequence; }

escape
  = "\\"

quotation_mark
  = '"'

unescaped
  = [^\0-\x1F\x22\x5C]

// ----- Core ABNF Rules -----

// See RFC 4234, Appendix B (http://tools.ietf.org/html/rfc4234).
DIGIT  = [0-9]
HEXDIG = [0-9a-f]i
 
Comment "comment"
  = MultiLineComment
  / SingleLineComment

SingleLineComment
  = ws? "//" (!LineTerminator .)*  { return { type: "comment" } }

MultiLineComment
  = ws? "/*" (!"*/" .)* "*/"  { return { type: "comment" } }

LineTerminator
  = [\n\r]
