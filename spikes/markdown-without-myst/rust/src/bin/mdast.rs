//! Read files (paths on stdin, one per line) and print one JSON mdast per line.
use std::io::{BufRead, Write};

fn main() {
    let options = litzio_markdown_spike::options::parse_options();
    let stdin = std::io::stdin();
    let mut out = std::io::BufWriter::new(std::io::stdout());
    for line in stdin.lock().lines() {
        let path = line.unwrap();
        let source = std::fs::read_to_string(&path).unwrap();
        match markdown::to_mdast(&source, &options) {
            Ok(tree) => writeln!(out, "{}", serde_json::to_string(&tree).unwrap()).unwrap(),
            Err(message) => writeln!(out, "{}", serde_json::json!({ "error": message.to_string() })).unwrap(),
        }
    }
}
