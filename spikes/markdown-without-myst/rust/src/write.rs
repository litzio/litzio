//! Stage 4 model → Markdown, written to match the JS path (remark-stringify 11 / mdast-util-to-markdown
//! 2.2.4 with the external profile options) byte for byte. Ported: `safe` escaping with the profile's
//! effective unsafe patterns (unsafe.json, dumped from JS), attention encoding (`render`/`encodeInfo`),
//! inline code, link, break, strikethrough, heading, paragraph, lists and task items, GFM table with
//! `markdown-table`. Not ported: the attention re-pairing search (`guess`/`fix`), setext headings,
//! autolink percent-encoding, the html-after-line-ending rule. Positions use chars, not UTF-16 units.
use crate::model::*;
use regex::Regex;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawPattern {
    character: String,
    #[serde(default)]
    before: Option<String>,
    #[serde(default)]
    after: Option<String>,
    #[serde(default)]
    at_break: Option<bool>,
    #[serde(default)]
    in_construct: Option<serde_json::Value>,
    #[serde(default)]
    not_in_construct: Option<serde_json::Value>,
}

struct Pattern {
    regex: Regex,
    has_before: bool,
    has_after: bool,
    at_break: bool,
    in_construct: Vec<String>,
    not_in_construct: Vec<String>,
    character: char,
}

fn list_of(value: &Option<serde_json::Value>) -> Vec<String> {
    match value {
        Some(serde_json::Value::String(s)) => vec![s.clone()],
        Some(serde_json::Value::Array(items)) => items.iter().filter_map(|v| v.as_str().map(String::from)).collect(),
        _ => vec![],
    }
}

fn patterns() -> &'static Vec<Pattern> {
    static PATTERNS: OnceLock<Vec<Pattern>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        let raw: Vec<RawPattern> = serde_json::from_str(include_str!("unsafe.json")).unwrap();
        raw.into_iter()
            .map(|p| {
                let ascii = |s: &str| s.replace("\\d", "[0-9]");
                let at_break = p.at_break.unwrap_or(false);
                let before = format!("{}{}", if at_break { "[\\r\\n][\\t ]*" } else { "" }, p.before.as_deref().map(|b| format!("(?:{})", ascii(b))).unwrap_or_default());
                let source = format!(
                    "{}{}{}",
                    if before.is_empty() { String::new() } else { format!("({})", before) },
                    regex::escape(&p.character),
                    p.after.as_deref().map(|a| format!("(?:{})", ascii(a))).unwrap_or_default()
                );
                Pattern {
                    regex: Regex::new(&source).unwrap_or_else(|e| panic!("{}: {}", source, e)),
                    has_before: p.before.is_some() || at_break,
                    has_after: p.after.is_some(),
                    at_break,
                    in_construct: list_of(&p.in_construct),
                    not_in_construct: list_of(&p.not_in_construct),
                    character: p.character.chars().next().unwrap(),
                }
            })
            .collect()
    })
}

fn punctuation() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(?:\p{P}|\p{S})$").unwrap())
}

#[derive(Clone, Copy, PartialEq)]
enum Class { Letter, Whitespace, Punctuation }

/// micromark `classifyCharacter`; `None` stands for JS `NaN` (an empty neighbour), which is a letter there.
fn classify(c: Option<char>) -> Class {
    match c {
        None => Class::Letter,
        Some(c) if c == ' ' || c.is_whitespace() || c == '\u{feff}' => Class::Whitespace,
        Some(c) if punctuation().is_match(c.encode_utf8(&mut [0; 4])) => Class::Punctuation,
        _ => Class::Letter,
    }
}

fn reference(c: char) -> String {
    format!("&#x{:X};", c as u32)
}

fn is_ascii_punctuation(c: char) -> bool {
    c.is_ascii_punctuation()
}

fn escape_backslashes(value: &str, after: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let tail: Vec<char> = after.chars().collect();
    let mut out = String::new();
    for (i, &c) in chars.iter().enumerate() {
        if c == '\\' {
            let next = chars.get(i + 1).or_else(|| tail.get(i + 1 - chars.len()));
            if next.map_or(false, |n| is_ascii_punctuation(*n)) {
                out.push('\\');
            }
        }
        out.push(c);
    }
    out
}

pub struct Writer {
    stack: Vec<&'static str>,
    bullet_last_used: Option<String>,
    bullet_current: Option<String>,
    bullet_ordered: String,
}

enum Item {
    Str(String),
    Attention { sequence: &'static str, children: Vec<Item> },
}

struct Token {
    value: String,
    attention: bool,
}

fn first_char(s: &str) -> Option<char> { s.chars().next() }
fn last_char(s: &str) -> Option<char> { s.chars().last() }

/// mdast-util-to-markdown `encodeInfo`.
fn encode_info(outside: Option<char>, inside: Option<char>, marker: char) -> (bool, bool) {
    let (o, i) = (classify(outside), classify(inside));
    match o {
        Class::Letter => match i {
            Class::Letter => if marker == '_' { (true, true) } else { (false, false) },
            Class::Whitespace => (true, true),
            Class::Punctuation => (false, true),
        },
        Class::Whitespace => match i {
            Class::Whitespace => (true, true),
            _ => (false, false),
        },
        Class::Punctuation => match i {
            Class::Whitespace => (true, false),
            _ => (false, false),
        },
    }
}

fn encode(tokens: &mut [Token], start: bool) {
    let Some(token) = (if start { tokens.first_mut() } else { tokens.last_mut() }) else { return };
    if token.attention { return; }
    let character = if start { first_char(&token.value) } else { last_char(&token.value) };
    let Some(character) = character else { return };
    if start {
        token.value = reference(character) + &token.value[character.len_utf8()..];
    } else {
        let mut value = token.value[..token.value.len() - character.len_utf8()].to_string();
        let escapes = value.chars().rev().take_while(|c| *c == '\\').count();
        if escapes % 2 == 1 { value.push('\\'); }
        token.value = value + &reference(character);
    }
}

fn render(items: &[Item], before: &str, after: &str) -> Vec<Token> {
    let mut tokens: Vec<Token> = Vec::new();
    let mut encode_after: Option<Option<char>> = None;
    let mut previous: String = last_char(before).map(String::from).unwrap_or_default();
    for (index, item) in items.iter().enumerate() {
        match item {
            Item::Str(value) => {
                let mut token = vec![Token { value: value.clone(), attention: false }];
                if let Some(expected) = encode_after.take() {
                    if expected.is_some() && expected == first_char(value) { encode(&mut token, true); }
                }
                if let Some(c) = last_char(&token[0].value) { previous = c.to_string(); }
                tokens.extend(token);
            }
            Item::Attention { sequence, children } => {
                let marker = sequence.chars().next().unwrap();
                let outside_before = previous.clone();
                let outside_after = match items.get(index + 1) {
                    None => first_char(after),
                    Some(Item::Str(s)) => first_char(s),
                    Some(Item::Attention { sequence, .. }) => first_char(sequence),
                };
                let mut inside = render(children, sequence, sequence);
                let head = first_char(&inside[0].value);
                let (open_inside, open_outside) = encode_info(last_char(&outside_before), head, marker);
                if open_inside { encode(&mut inside, true); }
                let tail = last_char(&inside[inside.len() - 1].value);
                let (close_inside, close_outside) = encode_info(outside_after, tail, marker);
                if close_inside { encode(&mut inside, false); }
                if open_outside && outside_before != "\n" && outside_before != "\r" { encode(&mut tokens, false); }
                if close_outside { encode_after = Some(outside_after); }
                tokens.push(Token { value: sequence.to_string(), attention: true });
                tokens.extend(inside);
                tokens.push(Token { value: sequence.to_string(), attention: true });
                previous = sequence.chars().last().unwrap().to_string();
            }
        }
    }
    tokens
}

fn serialize_items(items: &[Item], before: &str, after: &str) -> String {
    render(items, before, after).into_iter().map(|t| t.value).collect()
}

/// UTF-16 length, as `markdown-table`'s default `stringLength` (`value.length`).
fn js_length(s: &str) -> usize { s.encode_utf16().count() }

impl Writer {
    pub fn new() -> Self {
        Writer { stack: Vec::new(), bullet_last_used: None, bullet_current: None, bullet_ordered: ".".into() }
    }

    fn in_scope(&self, p: &Pattern) -> bool {
        let has = |list: &Vec<String>| list.iter().any(|c| self.stack.iter().any(|s| s == c));
        (p.in_construct.is_empty() || has(&p.in_construct)) && !(!p.not_in_construct.is_empty() && has(&p.not_in_construct))
    }

    /// mdast-util-to-markdown `safe`.
    fn safe(&self, input: &str, before: &str, after: &str) -> String {
        let value = format!("{}{}{}", before, input, after);
        let chars: Vec<char> = value.chars().collect();
        let mut char_at_byte = vec![0usize; value.len() + 1];
        for (ci, (bi, _)) in value.char_indices().enumerate() { char_at_byte[bi] = ci; }
        char_at_byte[value.len()] = chars.len();
        let offset = before.chars().count();
        let end = chars.len() - after.chars().count();
        let mut positions: Vec<usize> = Vec::new();
        let mut infos: HashMap<usize, (bool, bool)> = HashMap::new();
        for p in patterns() {
            // A pattern can only match where its character occurs.
            if !chars.contains(&p.character) || !self.in_scope(p) { continue; }
            for caps in p.regex.captures_iter(&value) {
                let whole = caps.get(0).unwrap();
                let shift = if p.has_before { caps.get(1).map_or(0, |m| m.len()) } else { 0 };
                let position = char_at_byte[whole.start() + shift];
                match infos.get_mut(&position) {
                    Some(info) => {
                        if info.0 && !p.has_before { info.0 = false; }
                        if info.1 && !p.has_after { info.1 = false; }
                    }
                    None => { positions.push(position); infos.insert(position, (p.has_before, p.has_after)); }
                }
            }
        }
        positions.sort_unstable();
        let mut result = String::new();
        let mut start = offset;
        let mut index = 0;
        let slice = |a: usize, b: usize| chars[a..b].iter().collect::<String>();
        while index < positions.len() {
            let position = positions[index];
            if position < start || position >= end { index += 1; continue; }
            if chars[position] == '_' && position > 0 && classify(Some(chars[position - 1])) == Class::Letter
                && !infos.contains_key(&(position - 1))
                && !(position - 1 == offset && offset > 0 && matches!(chars[offset - 1], '*' | '_'))
            {
                let mut sequence_end = position + 1;
                while sequence_end < end && chars[sequence_end] == '_' { sequence_end += 1; }
                let skip = sequence_end - position - 1;
                if positions.get(index + skip) == Some(&(sequence_end - 1)) && sequence_end < chars.len()
                    && classify(Some(chars[sequence_end])) == Class::Letter && !infos.contains_key(&sequence_end)
                    && !(sequence_end + 1 == end && end < chars.len() && matches!(chars[end], '*' | '_'))
                {
                    index += skip + 1;
                    continue;
                }
            }
            let info = infos[&position];
            if (position + 1 < end && positions.get(index + 1) == Some(&(position + 1)) && info.1 && {
                let next = infos[&(position + 1)]; !next.0 && !next.1 })
                || (position >= offset + 1 && index > 0 && positions[index - 1] == position - 1 && info.0 && {
                let previous = infos[&(position - 1)]; !previous.0 && !previous.1 })
            {
                index += 1;
                continue;
            }
            if start != position { result.push_str(&escape_backslashes(&slice(start, position), "\\")); }
            start = position + 1;
            let c = chars[position];
            if is_ascii_punctuation(c) { result.push('\\'); result.push(c); } else { result.push_str(&reference(c)); }
            index += 1;
        }
        result.push_str(&escape_backslashes(&slice(start, end), after));
        result
    }

    fn peek(&mut self, node: &Inline, in_cell: bool) -> String {
        match node {
            Inline::Strong { .. } | Inline::Emphasis { .. } => "*".into(),
            Inline::Code { .. } => "`".into(),
            Inline::Link { .. } => if self.autolink(node) { "<".into() } else { "[".into() },
            Inline::Delete { .. } => "~".into(),
            Inline::Break => if in_cell { "<".into() } else { first_char(&self.hard_break("")).map(String::from).unwrap_or_default() },
            Inline::Text { text } => first_char(&self.safe(text, "", "")).map(String::from).unwrap_or_default(),
        }
    }

    fn phrasing(&mut self, nodes: &[Inline], before: &str, after: &str, in_cell: bool) -> Vec<Item> {
        let mut results: Vec<Item> = Vec::new();
        let mut current_before = before.to_string();
        for (index, child) in nodes.iter().enumerate() {
            let child_after = match nodes.get(index + 1) { Some(next) => self.peek(next, in_cell), None => after.to_string() };
            match child {
                Inline::Strong { children } | Inline::Emphasis { children } => {
                    let (construct, sequence) = if matches!(child, Inline::Strong { .. }) { ("strong", "**") } else { ("emphasis", "*") };
                    self.stack.push(construct);
                    let inner = self.phrasing(children, sequence, sequence, in_cell);
                    self.stack.pop();
                    if inner.is_empty() { continue; }
                    current_before = sequence.chars().last().unwrap().to_string();
                    results.push(Item::Attention { sequence, children: inner });
                }
                _ => {
                    let value = self.inline(child, &current_before, &child_after, in_cell);
                    if value.is_empty() { continue; }
                    current_before = last_char(&value).map(String::from).unwrap_or_default();
                    results.push(Item::Str(value));
                }
            }
        }
        results
    }

    fn container_phrasing(&mut self, nodes: &[Inline], before: &str, after: &str, in_cell: bool) -> String {
        let items = self.phrasing(nodes, before, after, in_cell);
        serialize_items(&items, before, after)
    }

    fn hard_break(&self, before: &str) -> String {
        for p in patterns() {
            if p.character == '\n' && !p.has_before && !p.has_after && !p.at_break && self.in_scope(p) {
                return if before.ends_with(['\t', ' ']) { String::new() } else { " ".into() };
            }
        }
        "\\\n".into()
    }

    fn autolink(&self, node: &Inline) -> bool {
        let Inline::Link { url, title, children } = node else { return false };
        let raw: String = children.iter().map(|c| if let Inline::Text { text } = c { text.as_str() } else { "" }).collect();
        static SCHEME: OnceLock<Regex> = OnceLock::new();
        let scheme = SCHEME.get_or_init(|| Regex::new(r"(?i)^[a-z][+\-.a-z]+:").unwrap());
        !url.is_empty() && title.is_none() && children.len() == 1 && matches!(children[0], Inline::Text { .. })
            && (raw == *url || format!("mailto:{}", raw) == *url) && scheme.is_match(url)
            && !url.chars().any(|c| c <= ' ' || c == '<' || c == '>' || c == '\u{7f}')
    }

    fn inline(&mut self, node: &Inline, before: &str, after: &str, in_cell: bool) -> String {
        match node {
            Inline::Text { text } => self.safe(text, before, after),
            Inline::Break => if in_cell { "<br>".into() } else { self.hard_break(before) },
            Inline::Code { value } => self.inline_code(value),
            Inline::Delete { children } => {
                let sequence = if self.stack.contains(&"strikethrough") { "~" } else { "~~" };
                self.stack.push("strikethrough");
                let inner = self.container_phrasing(children, sequence, "~", in_cell);
                self.stack.pop();
                format!("{}{}{}", sequence, inner, sequence)
            }
            Inline::Link { url, title, children } => self.link(node, url, title, children, before, in_cell),
            Inline::Strong { .. } | Inline::Emphasis { .. } => unreachable!(),
        }
    }

    fn inline_code(&self, input: &str) -> String {
        let mut value = input.to_string();
        // The shortest backtick run that does not occur in the value (same result as the JS loop).
        let mut runs = std::collections::HashSet::new();
        let mut run = 0;
        for c in value.chars().chain(std::iter::once(' ')) {
            if c == '`' { run += 1; } else if run > 0 { runs.insert(run); run = 0; }
        }
        let mut size = 1;
        while runs.contains(&size) { size += 1; }
        let sequence = "`".repeat(size);
        let has_non_space = value.chars().any(|c| !matches!(c, '\n' | '\r' | ' '));
        if has_non_space && ((value.starts_with(['\n', '\r', ' ']) && value.ends_with(['\n', '\r', ' '])) || value.starts_with('`') || value.ends_with('`')) {
            value = format!(" {} ", value);
        }
        for p in patterns() {
            if !p.at_break { continue; }
            while let Some(m) = p.regex.find(&value) {
                let position = m.start();
                value = format!("{} {}", &value[..position], &value[position + 1..]);
            }
        }
        let mut out = format!("{}{}{}", sequence, value, sequence);
        if self.stack.contains(&"tableCell") {
            let chars: Vec<char> = out.chars().collect();
            let mut escaped = String::new();
            for (i, &c) in chars.iter().enumerate() {
                if c == '|' {
                    let backslashes = chars[..i].iter().rev().take_while(|c| **c == '\\').count();
                    if backslashes % 2 == 0 { escaped.push('\\'); }
                }
                escaped.push(c);
            }
            out = escaped;
        }
        out
    }

    fn link(&mut self, node: &Inline, url: &str, title: &Option<String>, children: &[Inline], before: &str, in_cell: bool) -> String {
        if self.autolink(node) {
            // Percent-encoding inside autolinks is not ported; the stage 4 corpus has none.
            return format!("<{}>", url);
        }
        self.stack.push("link");
        self.stack.push("label");
        let mut value = String::from("[");
        let text = self.container_phrasing(children, &value.clone(), "](", in_cell);
        value.push_str(&text);
        self.stack.pop();
        value.push_str("](");
        let enclose = url.starts_with('<') || url.chars().any(|c| c <= ' ' || c == '\u{7f}');
        let last = before.chars().last();
        let mut title = title.clone().filter(|t| !t.is_empty());
        if title.is_none() && !enclose && matches!(last, Some('\n' | '\r')) {
            let bytes: Vec<char> = text.chars().collect();
            let mut i = 0;
            while i < bytes.len() && bytes[i] != ']' { i += if bytes[i] == '\\' { 2 } else { 1 }; }
            if bytes.get(i + 1) == Some(&':') { title = Some(String::new()); }
        }
        if (url.is_empty() && title.is_some()) || enclose {
            self.stack.push("destinationLiteral");
            value.push('<');
            let escaped = self.safe(url, &value.clone(), ">");
            value.push_str(&escaped);
            value.push('>');
        } else {
            self.stack.push("destinationRaw");
            let escaped = self.safe(url, &value.clone(), if title.is_some() { " " } else { ")" });
            value.push_str(&escaped);
        }
        self.stack.pop();
        if let Some(title) = title {
            self.stack.push("titleQuote");
            value.push_str(" \"");
            let escaped = self.safe(&title, &value.clone(), "\"");
            value.push_str(&escaped);
            value.push('"');
            self.stack.pop();
        }
        value.push(')');
        self.stack.pop();
        value
    }

    fn heading(&mut self, level: u8, content: &[Inline]) -> String {
        self.stack.push("headingAtx");
        self.stack.push("phrasing");
        let mut value = self.container_phrasing(content, "# ", "\n", false);
        self.stack.pop();
        self.stack.pop();
        if let Some(head @ ('\t' | ' ')) = first_char(&value) { value = reference(head) + &value[1..]; }
        let sequence = "#".repeat(level.clamp(1, 6) as usize);
        if value.is_empty() { sequence } else { format!("{} {}", sequence, value) }
    }

    fn paragraph(&mut self, content: &[Inline]) -> String {
        self.stack.push("paragraph");
        self.stack.push("phrasing");
        let value = self.container_phrasing(content, "\n", "\n", false);
        self.stack.pop();
        self.stack.pop();
        value
    }

    fn list(&mut self, list: &List) -> String {
        if list.ordered {
            let saved = std::mem::replace(&mut self.bullet_ordered, list.delimiter.clone().unwrap_or_else(|| ".".into()));
            self.bullet_last_used = None;
            let value = self.list_default(list);
            self.bullet_ordered = saved;
            return value;
        }
        self.list_default(list)
    }

    fn list_default(&mut self, list: &List) -> String {
        self.stack.push("list");
        let current = self.bullet_current.clone();
        let mut bullet = if list.ordered { self.bullet_ordered.clone() } else { "*".to_string() };
        let other = if list.ordered { if bullet == "." { ")".to_string() } else { ".".to_string() } } else { "-".to_string() };
        if self.bullet_last_used.as_deref() == Some(bullet.as_str()) { bullet = other; }
        self.bullet_current = Some(bullet.clone());
        let mut items = Vec::new();
        for (index, item) in list.items.iter().enumerate() {
            items.push(self.list_item(list, index, item, &bullet));
            self.bullet_last_used = None;
        }
        let value = items.join("\n");
        self.bullet_last_used = Some(bullet);
        self.bullet_current = current;
        self.stack.pop();
        value
    }

    fn list_item(&mut self, list: &List, index: usize, item: &ListItem, bullet: &str) -> String {
        let bullet = if list.ordered { format!("{}{}", list.start.unwrap_or(1) as usize + index, bullet) } else { bullet.to_string() };
        let size = bullet.chars().count() + 1;
        self.stack.push("listItem");
        let mut parts: Vec<String> = Vec::new();
        if !item.content.is_empty() { parts.push(self.paragraph(&item.content)); self.bullet_last_used = None; }
        if let Some(nested) = &item.list { parts.push(self.list(nested)); }
        self.stack.pop();
        let inner = parts.join("\n");
        let mut value = inner.split('\n').enumerate().map(|(i, line)| {
            let blank = line.is_empty();
            if i > 0 { format!("{}{}", if blank { String::new() } else { " ".repeat(size) }, line) }
            else { format!("{}{}", if blank { bullet.clone() } else { format!("{}{}", bullet, " ".repeat(size - bullet.chars().count())) }, line) }
        }).collect::<Vec<_>>().join("\n");
        if let (Some(checked), false) = (item.checked, item.content.is_empty()) {
            static CHECK: OnceLock<Regex> = OnceLock::new();
            let re = CHECK.get_or_init(|| Regex::new(r"^(?:[*+-]|[0-9]+\.)(?:[\r\n]| {1,3})").unwrap());
            if let Some(m) = re.find(&value) {
                value = format!("{}[{}] {}", &value[..m.end()], if checked { "x" } else { " " }, &value[m.end()..]);
            }
        }
        value
    }

    fn table(&mut self, table: &Table) -> String {
        self.stack.push("table");
        let mut matrix: Vec<Vec<String>> = Vec::new();
        for row in &table.rows {
            self.stack.push("tableRow");
            let mut cells = Vec::new();
            for cell in &row.cells {
                self.stack.push("tableCell");
                self.stack.push("phrasing");
                cells.push(self.container_phrasing(&cell.content, "|", "|", true));
                self.stack.pop();
                self.stack.pop();
            }
            self.stack.pop();
            matrix.push(cells);
        }
        self.stack.pop();
        let align: Vec<Option<String>> = table.rows.first().map(|r| r.cells.iter().map(|c| c.align.clone()).collect()).unwrap_or_default();
        markdown_table(&matrix, &align)
    }

    pub fn write(&mut self, model: &Model) -> String {
        let mut blocks: Vec<String> = vec![format!("---\n{}\n---", model.frontmatter_yaml)];
        for block in &model.blocks {
            let value = match block {
                Block::Heading { level, content } => self.heading(*level, content),
                Block::Paragraph { content } => self.paragraph(content),
                Block::List(list) => self.list(list),
                Block::Table(table) => self.table(table),
            };
            if !matches!(block, Block::List(_)) { self.bullet_last_used = None; }
            blocks.push(value);
        }
        let mut out = blocks.join("\n\n");
        out.push('\n');
        out
    }
}

/// `markdown-table` 3 with alignDelimiters, padding, fillRows false and UTF-16 string length.
fn markdown_table(matrix: &[Vec<String>], align: &[Option<String>]) -> String {
    let columns = align.len().max(matrix.iter().map(|r| r.len()).max().unwrap_or(0));
    let mut longest = vec![0usize; columns];
    let mut sizes: Vec<Vec<usize>> = Vec::new();
    for row in matrix {
        let row_sizes: Vec<usize> = row.iter().map(|c| js_length(c)).collect();
        for (i, s) in row_sizes.iter().enumerate() { if *s > longest[i] { longest[i] = *s; } }
        sizes.push(row_sizes);
    }
    let codes: Vec<char> = (0..columns).map(|i| match align.get(i).cloned().flatten().as_deref() { Some("left") => 'l', Some("center") => 'c', Some("right") => 'r', _ => ' ' }).collect();
    let mut delimiter_row = Vec::new();
    let mut delimiter_sizes = Vec::new();
    for i in 0..columns {
        let (before, after) = match codes[i] { 'c' => (":", ":"), 'l' => (":", ""), 'r' => ("", ":"), _ => ("", "") };
        let size = 1usize.max(longest[i].saturating_sub(before.len() + after.len()));
        let cell = format!("{}{}{}", before, "-".repeat(size), after);
        let total = before.len() + size + after.len();
        if total > longest[i] { longest[i] = total; }
        delimiter_sizes.push(total);
        delimiter_row.push(cell);
    }
    let mut rows: Vec<(Vec<String>, Vec<usize>)> = matrix.iter().cloned().zip(sizes).collect();
    rows.insert(1.min(rows.len()), (delimiter_row, delimiter_sizes));
    let mut lines = Vec::new();
    for (index, (row, row_sizes)) in rows.iter().enumerate() {
        let cells_in_row = 1usize.max(if index == 1 { rows[0].0.len() } else { row.len() });
        let mut line = String::new();
        for column in 0..cells_in_row {
            let cell = row.get(column).cloned().unwrap_or_default();
            let size = longest[column] - row_sizes.get(column).copied().unwrap_or(0);
            let (before, after) = match codes[column] {
                'r' => (" ".repeat(size), String::new()),
                'c' => if size % 2 == 1 { (" ".repeat(size / 2 + 1), " ".repeat(size / 2)) } else { (" ".repeat(size / 2), " ".repeat(size / 2)) },
                _ => (String::new(), " ".repeat(size)),
            };
            if column == 0 { line.push('|'); }
            line.push(' ');
            line.push_str(&before);
            line.push_str(&cell);
            line.push_str(&after);
            line.push(' ');
            line.push('|');
        }
        lines.push(line);
    }
    lines.join("\n")
}
