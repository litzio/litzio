//! Stage 4, path 3 (native): time read / convert / write / guarded write; save model and Markdown.
use std::time::Instant;

fn median(mut v: Vec<f64>) -> f64 { v.sort_by(|a, b| a.partial_cmp(b).unwrap()); (v[v.len() / 2] * 10.0).round() / 10.0 }
fn time<T>(runs: usize, mut f: impl FnMut() -> T) -> f64 {
    for _ in 0..2 { std::hint::black_box(f()); }
    median((0..runs).map(|_| { let t = Instant::now(); std::hint::black_box(f()); t.elapsed().as_secs_f64() * 1000.0 }).collect())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (file, runs, model_out, markdown_out) = (&args[1], args[2].parse::<usize>().unwrap(), &args[3], &args[4]);
    let source = std::fs::read_to_string(file).unwrap();
    let tree = litzio_markdown_spike::read(&source).unwrap();
    let model = litzio_markdown_spike::convert(&tree, &source).unwrap();
    let markdown = litzio_markdown_spike::write(&model);
    std::fs::write(model_out, serde_json::to_string(&model).unwrap()).unwrap();
    std::fs::write(markdown_out, &markdown).unwrap();
    let read = time(runs, || litzio_markdown_spike::read(&source).unwrap());
    let convert = time(runs, || litzio_markdown_spike::convert(&tree, &source).unwrap());
    let write = time(runs, || litzio_markdown_spike::write(&model));
    let guarded = time(runs, || litzio_markdown_spike::guarded_write(&model).unwrap());
    println!("{}", serde_json::json!({ "read": read, "convert": convert, "write": write, "guarded write": guarded, "bytes": markdown.len(), "blocks": model.blocks.len() }));
}
