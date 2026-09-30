//! ISO 10303-21 clear-text encoding: a bounded reader for the DATA section
//! and the value formatting used by the IFC writer.
use std::collections::BTreeMap;
use workbench_model::{Result, err};

/// One parameter of an entity instance.
#[derive(Clone, Debug, PartialEq)]
pub enum Param {
    /// `$`: the value is not provided.
    Null,
    /// `*`: the value is derived in a subtype.
    Derived,
    Int(i64),
    Real(f64),
    Str(String),
    /// `.NAME.`; `.T.`, `.F.` and `.U.` stay enumerations.
    Enum(String),
    Ref(u64),
    List(Vec<Param>),
    /// A typed value such as `IFCLENGTHMEASURE(1.5)`.
    Typed(String, Box<Param>),
}

impl Param {
    pub fn as_ref(&self) -> Option<u64> {
        match self {
            Param::Ref(r) => Some(*r),
            _ => None,
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Param::Str(s) => Some(s),
            _ => None,
        }
    }
    pub fn as_enum(&self) -> Option<&str> {
        match self {
            Param::Enum(s) => Some(s),
            _ => None,
        }
    }
    /// A number, including one wrapped in a typed value.
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Param::Real(x) => Some(*x),
            Param::Int(i) => Some(*i as f64),
            Param::Typed(_, v) => v.as_f64(),
            _ => None,
        }
    }
    pub fn as_list(&self) -> Option<&[Param]> {
        match self {
            Param::List(v) => Some(v),
            _ => None,
        }
    }
    pub fn is_null(&self) -> bool {
        matches!(self, Param::Null)
    }
}

#[derive(Clone, Debug)]
pub struct Instance {
    /// Upper-case entity name, e.g. `IFCSTRUCTURALCURVEMEMBER`.
    pub name: String,
    pub params: Vec<Param>,
}

impl Instance {
    pub fn get(&self, k: usize) -> &Param {
        self.params.get(k).unwrap_or(&Param::Null)
    }
}

#[derive(Debug, Default)]
pub struct StepFile {
    /// `FILE_SCHEMA` identifiers, upper case.
    pub schemas: Vec<String>,
    pub instances: BTreeMap<u64, Instance>,
}

impl StepFile {
    pub fn get(&self, id: u64) -> Result<&Instance> {
        self.instances.get(&id).ok_or_else(|| {
            err(
                "INVALID_EXCHANGE_FILE",
                format!("#{id} is referenced but not defined"),
            )
        })
    }
    /// The instance `p` refers to, of one of the given entity names.
    pub fn deref(&self, p: &Param, names: &[&str]) -> Result<(u64, &Instance)> {
        let id = p.as_ref().ok_or_else(|| {
            err(
                "INVALID_EXCHANGE_FILE",
                format!("expected a reference to {}", names.join(" or ")),
            )
        })?;
        let inst = self.get(id)?;
        if !names.is_empty() && !names.contains(&inst.name.as_str()) {
            return Err(err(
                "INVALID_EXCHANGE_FILE",
                format!(
                    "#{id} is {} where {} is expected",
                    inst.name,
                    names.join(" or ")
                ),
            ));
        }
        Ok((id, inst))
    }
    pub fn of_type<'a>(&'a self, name: &'a str) -> impl Iterator<Item = (u64, &'a Instance)> + 'a {
        self.instances
            .iter()
            .filter(move |(_, i)| i.name == name)
            .map(|(k, i)| (*k, i))
    }
}

/// Upper bounds on what the reader accepts before any allocation grows.
pub const MAX_INSTANCES: usize = 2_000_000;
const MAX_DEPTH: usize = 32;

pub fn parse(text: &str) -> Result<StepFile> {
    let mut lx = Lexer {
        s: text.as_bytes(),
        i: 0,
    };
    lx.skip_ws()?;
    if !lx.eat_keyword("ISO-10303-21") {
        return Err(err("INVALID_EXCHANGE_FILE", "Not an ISO 10303-21 file"));
    }
    lx.expect(b';')?;
    let mut file = StepFile::default();
    // HEADER: only FILE_SCHEMA is interpreted.
    lx.skip_ws()?;
    if !lx.eat_keyword("HEADER") {
        return Err(err("INVALID_EXCHANGE_FILE", "Missing HEADER section"));
    }
    lx.expect(b';')?;
    loop {
        lx.skip_ws()?;
        if lx.eat_keyword("ENDSEC") {
            lx.expect(b';')?;
            break;
        }
        let name = lx.keyword()?;
        lx.skip_ws()?;
        let params = lx.params(0)?;
        lx.skip_ws()?;
        lx.expect(b';')?;
        if name == "FILE_SCHEMA" {
            if let Some(Param::List(v)) = params.first() {
                file.schemas = v
                    .iter()
                    .filter_map(|p| p.as_str().map(|s| s.trim().to_ascii_uppercase()))
                    .collect();
            }
        }
    }
    lx.skip_ws()?;
    if !lx.eat_keyword("DATA") {
        return Err(err("INVALID_EXCHANGE_FILE", "Missing DATA section"));
    }
    lx.skip_ws()?;
    if lx.peek() == Some(b'(') {
        // A named DATA section (ISO 10303-21 edition 3) is not supported.
        return Err(err(
            "UNSUPPORTED_FEATURE",
            "Named or multiple DATA sections are not supported",
        ));
    }
    lx.expect(b';')?;
    loop {
        lx.skip_ws()?;
        if lx.eat_keyword("ENDSEC") {
            lx.expect(b';')?;
            break;
        }
        lx.expect(b'#')?;
        let id = lx.integer()? as u64;
        lx.skip_ws()?;
        lx.expect(b'=')?;
        lx.skip_ws()?;
        if lx.peek() == Some(b'(') {
            return Err(err(
                "UNSUPPORTED_FEATURE",
                format!("#{id} is a complex (multi-leaf) entity instance, which is not supported"),
            ));
        }
        let name = lx.keyword()?;
        lx.skip_ws()?;
        let params = lx.params(0)?;
        lx.skip_ws()?;
        lx.expect(b';')?;
        if file.instances.len() >= MAX_INSTANCES {
            return Err(err(
                "MEMORY_LIMIT",
                format!("More than {MAX_INSTANCES} entity instances"),
            ));
        }
        if file
            .instances
            .insert(id, Instance { name, params })
            .is_some()
        {
            return Err(err(
                "INVALID_EXCHANGE_FILE",
                format!("#{id} is defined twice"),
            ));
        }
    }
    lx.skip_ws()?;
    if !lx.eat_keyword("END-ISO-10303-21") {
        return Err(err("INVALID_EXCHANGE_FILE", "Missing END-ISO-10303-21"));
    }
    Ok(file)
}

struct Lexer<'a> {
    s: &'a [u8],
    i: usize,
}

impl Lexer<'_> {
    fn peek(&self) -> Option<u8> {
        self.s.get(self.i).copied()
    }
    fn at(&self) -> String {
        let line = self.s[..self.i.min(self.s.len())]
            .iter()
            .filter(|&&b| b == b'\n')
            .count()
            + 1;
        format!("line {line}")
    }
    fn fail<T>(&self, what: &str) -> Result<T> {
        Err(err(
            "INVALID_EXCHANGE_FILE",
            format!("{what} at {}", self.at()),
        ))
    }
    fn skip_ws(&mut self) -> Result<()> {
        loop {
            match self.peek() {
                Some(b) if b.is_ascii_whitespace() => self.i += 1,
                Some(b'/') if self.s.get(self.i + 1) == Some(&b'*') => {
                    let rest = &self.s[self.i + 2..];
                    match rest.windows(2).position(|w| w == b"*/") {
                        Some(k) => self.i += k + 4,
                        None => return self.fail("Unterminated comment"),
                    }
                }
                _ => return Ok(()),
            }
        }
    }
    fn expect(&mut self, b: u8) -> Result<()> {
        if self.peek() == Some(b) {
            self.i += 1;
            Ok(())
        } else {
            self.fail(&format!("Expected '{}'", b as char))
        }
    }
    fn eat_keyword(&mut self, k: &str) -> bool {
        let end = self.i + k.len();
        if self.s.get(self.i..end) == Some(k.as_bytes())
            && !self
                .s
                .get(end)
                .is_some_and(|b| b.is_ascii_alphanumeric() || *b == b'_')
        {
            self.i = end;
            true
        } else {
            false
        }
    }
    fn keyword(&mut self) -> Result<String> {
        let start = self.i;
        while self
            .peek()
            .is_some_and(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        {
            self.i += 1;
        }
        if start == self.i {
            return self.fail("Expected a keyword");
        }
        Ok(String::from_utf8_lossy(&self.s[start..self.i]).to_ascii_uppercase())
    }
    fn integer(&mut self) -> Result<i64> {
        let start = self.i;
        if matches!(self.peek(), Some(b'-' | b'+')) {
            self.i += 1;
        }
        while self.peek().is_some_and(|b| b.is_ascii_digit()) {
            self.i += 1;
        }
        std::str::from_utf8(&self.s[start..self.i])
            .ok()
            .and_then(|t| t.parse().ok())
            .map_or_else(|| self.fail("Expected an integer"), Ok)
    }
    fn params(&mut self, depth: usize) -> Result<Vec<Param>> {
        if depth > MAX_DEPTH {
            return self.fail("Nesting too deep");
        }
        self.expect(b'(')?;
        let mut out = vec![];
        self.skip_ws()?;
        if self.peek() == Some(b')') {
            self.i += 1;
            return Ok(out);
        }
        loop {
            self.skip_ws()?;
            out.push(self.param(depth)?);
            self.skip_ws()?;
            match self.peek() {
                Some(b',') => self.i += 1,
                Some(b')') => {
                    self.i += 1;
                    return Ok(out);
                }
                _ => return self.fail("Expected ',' or ')'"),
            }
        }
    }
    fn param(&mut self, depth: usize) -> Result<Param> {
        match self.peek() {
            Some(b'$') => {
                self.i += 1;
                Ok(Param::Null)
            }
            Some(b'*') => {
                self.i += 1;
                Ok(Param::Derived)
            }
            Some(b'#') => {
                self.i += 1;
                Ok(Param::Ref(self.integer()? as u64))
            }
            Some(b'\'') => self.string().map(Param::Str),
            Some(b'"') => {
                // Binary: kept as its hexadecimal text.
                self.i += 1;
                let start = self.i;
                while self.peek().is_some_and(|b| b != b'"') {
                    self.i += 1;
                }
                let t = String::from_utf8_lossy(&self.s[start..self.i]).to_string();
                self.expect(b'"')?;
                Ok(Param::Str(t))
            }
            Some(b'.') => {
                self.i += 1;
                let k = self.keyword()?;
                self.expect(b'.')?;
                Ok(Param::Enum(k))
            }
            Some(b'(') => self.params(depth + 1).map(Param::List),
            Some(b) if b.is_ascii_digit() || b == b'-' || b == b'+' => self.number(),
            Some(b) if b.is_ascii_alphabetic() => {
                let name = self.keyword()?;
                self.skip_ws()?;
                let mut v = self.params(depth + 1)?;
                if v.len() != 1 {
                    return self.fail("A typed parameter takes exactly one value");
                }
                Ok(Param::Typed(name, Box::new(v.remove(0))))
            }
            _ => self.fail("Unexpected character"),
        }
    }
    fn number(&mut self) -> Result<Param> {
        let start = self.i;
        if matches!(self.peek(), Some(b'-' | b'+')) {
            self.i += 1;
        }
        let mut real = false;
        while let Some(b) = self.peek() {
            match b {
                b'0'..=b'9' => self.i += 1,
                b'.' | b'E' | b'e' => {
                    real = true;
                    self.i += 1;
                    if matches!(b, b'E' | b'e') && matches!(self.peek(), Some(b'-' | b'+')) {
                        self.i += 1;
                    }
                }
                _ => break,
            }
        }
        let t = std::str::from_utf8(&self.s[start..self.i]).unwrap_or("");
        if real {
            // ISO 10303-21 allows "1." and "1.E5"; Rust needs a digit after '.'.
            let fixed = t.replace(".E", ".0E").replace(".e", ".0e");
            let fixed = if fixed.ends_with('.') {
                format!("{fixed}0")
            } else {
                fixed
            };
            match fixed.parse::<f64>() {
                Ok(x) if x.is_finite() => Ok(Param::Real(x)),
                _ => self.fail("Invalid real"),
            }
        } else {
            t.parse()
                .map(Param::Int)
                .map_or_else(|_| self.fail("Invalid integer"), Ok)
        }
    }
    /// A string with `''` quotes and the `\X\`, `\X2\`, `\X4\` and `\S\`
    /// control directives decoded.
    fn string(&mut self) -> Result<String> {
        self.expect(b'\'')?;
        let mut raw = vec![];
        loop {
            match self.peek() {
                None => return self.fail("Unterminated string"),
                Some(b'\'') if self.s.get(self.i + 1) == Some(&b'\'') => {
                    raw.push(b'\'');
                    self.i += 2;
                }
                Some(b'\'') => {
                    self.i += 1;
                    break;
                }
                Some(b) => {
                    raw.push(b);
                    self.i += 1;
                }
            }
        }
        decode_string(&raw).map_or_else(|| self.fail("Invalid string encoding"), Ok)
    }
}

fn hex(s: &[u8]) -> Option<u32> {
    u32::from_str_radix(std::str::from_utf8(s).ok()?, 16).ok()
}

fn decode_string(raw: &[u8]) -> Option<String> {
    let mut out = String::new();
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'\\' {
            let rest = &raw[i..];
            if rest.starts_with(b"\\X2\\") || rest.starts_with(b"\\X4\\") {
                let width = if rest[2] == b'2' { 4 } else { 8 };
                let body = &rest[4..];
                let end = body.windows(4).position(|w| w == b"\\X0\\")?;
                let digits = &body[..end];
                if digits.len() % width != 0 {
                    return None;
                }
                let units: Vec<u32> = digits.chunks(width).map(hex).collect::<Option<_>>()?;
                if width == 4 {
                    let u16s: Vec<u16> = units.iter().map(|&u| u as u16).collect();
                    out.push_str(&String::from_utf16(&u16s).ok()?);
                } else {
                    for u in units {
                        out.push(char::from_u32(u)?);
                    }
                }
                i += 4 + end + 4;
            } else if rest.starts_with(b"\\X\\") && rest.len() >= 5 {
                out.push(char::from_u32(hex(&rest[3..5])?)?);
                i += 5;
            } else if rest.starts_with(b"\\S\\") && rest.len() >= 4 {
                out.push(char::from_u32(rest[3] as u32 + 128)?);
                i += 4;
            } else if rest.starts_with(b"\\P") && rest.len() >= 4 && rest[3] == b'\\' {
                // Code page switch: ISO 8859-1 is assumed throughout.
                i += 4;
            } else if rest.starts_with(b"\\\\") {
                out.push('\\');
                i += 2;
            } else {
                out.push('\\');
                i += 1;
            }
        } else {
            // Clear text is 7-bit per the standard; tolerate UTF-8.
            let start = i;
            while i < raw.len() && raw[i] != b'\\' {
                i += 1;
            }
            out.push_str(std::str::from_utf8(&raw[start..i]).ok()?);
        }
    }
    Some(out)
}

/// A string literal: printable ASCII kept, `'` doubled, `\` doubled, and
/// everything else as `\X2\` UTF-16 code units.
pub fn string(s: &str) -> String {
    let mut out = String::from("'");
    let mut wide = String::new();
    let flush = |out: &mut String, wide: &mut String| {
        if !wide.is_empty() {
            out.push_str("\\X2\\");
            out.push_str(wide);
            out.push_str("\\X0\\");
            wide.clear();
        }
    };
    for c in s.chars() {
        if (' '..='~').contains(&c) {
            flush(&mut out, &mut wide);
            match c {
                '\'' => out.push_str("''"),
                '\\' => out.push_str("\\\\"),
                _ => out.push(c),
            }
        } else {
            let mut buf = [0u16; 2];
            for u in c.encode_utf16(&mut buf) {
                wide.push_str(&format!("{u:04X}"));
            }
        }
    }
    flush(&mut out, &mut wide);
    out.push('\'');
    out
}

/// A real in the shortest form that round-trips, always with a '.' in the
/// mantissa as ISO 10303-21 requires.
pub fn real(x: f64) -> String {
    let x = if x == 0. { 0. } else { x };
    let s = format!("{x:?}");
    let (mantissa, exponent) = match s.split_once('e') {
        Some((m, e)) => (m.to_string(), Some(e.to_string())),
        None => (s, None),
    };
    let mantissa = if mantissa.contains('.') {
        mantissa.trim_end_matches('0').to_string()
    } else {
        format!("{mantissa}.")
    };
    match exponent {
        Some(e) => format!("{mantissa}E{e}"),
        None => mantissa,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reals_round_trip_in_step_form() {
        for x in [
            0.,
            -0.,
            1.,
            1.5,
            -2.25e-7,
            6.02e23,
            0.1,
            1e-300,
            123456789.125,
        ] {
            let t = real(x);
            assert!(t.contains('.'), "{t}");
            let back = parse(&format!(
                "ISO-10303-21;HEADER;ENDSEC;DATA;#1=X({t});ENDSEC;END-ISO-10303-21;"
            ))
            .unwrap();
            assert_eq!(
                back.instances[&1].params[0].as_f64(),
                Some(if x == 0. { 0. } else { x })
            );
        }
        assert_eq!(real(1.), "1.");
        assert_eq!(real(1.5e-7), "1.5E-7");
    }

    #[test]
    fn strings_round_trip_with_quotes_and_unicode() {
        for s in ["plain", "it's", "a\\b", "Straße 3 – μ", "𝛼 beam", ""] {
            let file = parse(&format!(
                "ISO-10303-21;HEADER;ENDSEC;DATA;#1=X({});ENDSEC;END-ISO-10303-21;",
                string(s)
            ))
            .unwrap();
            assert_eq!(file.instances[&1].params[0].as_str(), Some(s));
        }
    }

    #[test]
    fn parses_typed_values_lists_enums_and_comments() {
        let f = parse(
            "ISO-10303-21;\nHEADER;FILE_DESCRIPTION(('x'),'2;1');FILE_SCHEMA(('IFC4'));ENDSEC;\nDATA;\n/* c */#10=IFCX($,*,.T.,(1,2.,#3),IFCLENGTHMEASURE(2.5),'\\X2\\00E9\\X0\\');\nENDSEC;END-ISO-10303-21;",
        )
        .unwrap();
        assert_eq!(f.schemas, vec!["IFC4"]);
        let p = &f.instances[&10].params;
        assert!(p[0].is_null());
        assert_eq!(p[1], Param::Derived);
        assert_eq!(p[2].as_enum(), Some("T"));
        assert_eq!(
            p[3],
            Param::List(vec![Param::Int(1), Param::Real(2.), Param::Ref(3)])
        );
        assert_eq!(p[4].as_f64(), Some(2.5));
        assert_eq!(p[5].as_str(), Some("é"));
    }

    #[test]
    fn refuses_malformed_files() {
        for bad in [
            "",
            "ISO-10303-21;HEADER;ENDSEC;DATA;#1=X(;ENDSEC;END-ISO-10303-21;",
            "ISO-10303-21;HEADER;ENDSEC;DATA;#1=X();#1=Y();ENDSEC;END-ISO-10303-21;",
            "ISO-10303-21;HEADER;ENDSEC;DATA;#1=X('open);ENDSEC;END-ISO-10303-21;",
            "ISO-10303-21;HEADER;ENDSEC;DATA;#1=(A()B());ENDSEC;END-ISO-10303-21;",
        ] {
            assert!(parse(bad).is_err(), "{bad}");
        }
    }
}
