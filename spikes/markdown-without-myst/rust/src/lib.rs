//! Spike: markdown-rs with the same construct set as the JS profiles, and the stage 4 pipeline
//! (read with markdown-rs → Litzio model subset → canonical Markdown).
pub mod model;
pub mod read;
pub mod write;

pub mod options {
    use markdown::{Constructs, ParseOptions};

    /// CommonMark + GFM subset (no autolink literal, no single tilde) + `$` math + YAML frontmatter.
    pub fn parse_options() -> ParseOptions {
        ParseOptions {
            constructs: Constructs {
                frontmatter: true,
                gfm_autolink_literal: false,
                gfm_footnote_definition: true,
                gfm_label_start_footnote: true,
                gfm_strikethrough: true,
                gfm_table: true,
                gfm_task_list_item: true,
                math_flow: true,
                math_text: true,
                ..Constructs::default()
            },
            gfm_strikethrough_single_tilde: false,
            math_text_single_dollar: true,
            ..ParseOptions::default()
        }
    }
}

pub fn read(source: &str) -> Result<markdown::mdast::Node, String> {
    markdown::to_mdast(source, &options::parse_options()).map_err(|m| m.to_string())
}

pub fn convert(tree: &markdown::mdast::Node, source: &str) -> Result<model::Model, String> {
    read::to_model(tree, source)
}

pub fn write(model: &model::Model) -> String {
    write::Writer::new().write(model)
}

/// Write, read back and compare: the guard a canonical writer runs before committing.
pub fn guarded_write(model: &model::Model) -> Result<String, String> {
    let out = write(model);
    let back = convert(&read(&out)?, &out)?;
    if back != *model { return Err("guard: model changed".into()); }
    Ok(out)
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    //! Plain exports, no wasm-bindgen: JS copies UTF-8 in with `alloc`, reads results via `out_*`.
    use std::cell::RefCell;
    thread_local! {
        static TREE: RefCell<Option<(markdown::mdast::Node, String)>> = RefCell::new(None);
        static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new());
    }
    fn input(ptr: *mut u8, len: usize) -> String {
        unsafe { String::from_utf8(Vec::from_raw_parts(ptr, len, len)).unwrap() }
    }
    fn output(value: Vec<u8>) { OUT.with(|o| *o.borrow_mut() = value); }
    #[no_mangle] pub extern "C" fn alloc(len: usize) -> *mut u8 {
        let mut v: Vec<u8> = Vec::with_capacity(len); let p = v.as_mut_ptr(); std::mem::forget(v); p
    }
    #[no_mangle] pub extern "C" fn out_ptr() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
    #[no_mangle] pub extern "C" fn out_len() -> usize { OUT.with(|o| o.borrow().len()) }
    /// Parse Markdown and keep the mdast inside WASM memory.
    #[no_mangle] pub extern "C" fn parse(ptr: *mut u8, len: usize) -> i32 {
        let source = input(ptr, len);
        match super::read(&source) { Ok(tree) => { TREE.with(|t| *t.borrow_mut() = Some((tree, source))); 0 } Err(e) => { output(e.into_bytes()); 1 } }
    }
    /// The kept mdast → model → JSON in `out`.
    #[no_mangle] pub extern "C" fn convert() -> i32 {
        TREE.with(|t| {
            let t = t.borrow();
            let (tree, source) = t.as_ref().unwrap();
            match super::convert(tree, source) {
                Ok(model) => { output(serde_json::to_vec(&model).unwrap()); 0 }
                Err(e) => { output(e.into_bytes()); 1 }
            }
        })
    }
    /// Model JSON → Markdown in `out`. `guarded` also reads it back and compares.
    #[no_mangle] pub extern "C" fn write(ptr: *mut u8, len: usize, guarded: i32) -> i32 {
        let model: super::model::Model = serde_json::from_str(&input(ptr, len)).unwrap();
        let result = if guarded != 0 { super::guarded_write(&model) } else { Ok(super::write(&model)) };
        match result { Ok(md) => { output(md.into_bytes()); 0 } Err(e) => { output(e.into_bytes()); 1 } }
    }
}
