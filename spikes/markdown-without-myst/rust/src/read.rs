//! markdown-rs mdast → stage 4 model (external profile, subset). Fails closed on anything else.
use crate::model::*;
use markdown::mdast::{self, Node};

pub fn to_model(tree: &Node, source: &str) -> Result<Model, String> {
    let children = tree.children().ok_or("no root")?;
    let mut frontmatter_yaml = String::new();
    let mut blocks = Vec::new();
    for (index, node) in children.iter().enumerate() {
        match node {
            Node::Yaml(yaml) if index == 0 => frontmatter_yaml = yaml.value.clone(),
            Node::Heading(heading) => blocks.push(Block::Heading { level: heading.depth, content: inline(&heading.children, false)? }),
            Node::Paragraph(paragraph) => blocks.push(Block::Paragraph { content: inline(&paragraph.children, false)? }),
            Node::List(list) => blocks.push(Block::List(read_list(list, source)?)),
            Node::Table(table) => blocks.push(Block::Table(read_table(table)?)),
            other => return Err(format!("unsupported block {:?}", node_type(other))),
        }
    }
    Ok(Model { frontmatter_yaml, blocks })
}

fn node_type(node: &Node) -> String {
    format!("{:?}", node).split(['(', ' ', '{']).next().unwrap_or("").to_string()
}

fn push_text(out: &mut Vec<Inline>, value: &str) {
    if value.is_empty() {
        return;
    }
    if let Some(Inline::Text { text }) = out.last_mut() {
        text.push_str(value);
    } else {
        out.push(Inline::Text { text: value.to_string() });
    }
}

fn inline(nodes: &[Node], in_cell: bool) -> Result<Vec<Inline>, String> {
    let mut out = Vec::new();
    for node in nodes {
        match node {
            Node::Text(text) => push_text(&mut out, &text.value),
            Node::Break(_) => out.push(Inline::Break),
            Node::InlineCode(code) => out.push(Inline::Code { value: code.value.clone() }),
            Node::Strong(strong) => out.push(Inline::Strong { children: inline(&strong.children, in_cell)? }),
            Node::Emphasis(emphasis) => out.push(Inline::Emphasis { children: inline(&emphasis.children, in_cell)? }),
            Node::Delete(delete) => out.push(Inline::Delete { children: inline(&delete.children, in_cell)? }),
            Node::Link(link) => out.push(Inline::Link { url: link.url.clone(), title: link.title.clone(), children: inline(&link.children, in_cell)? }),
            Node::Html(html) if in_cell && is_break(&html.value) => out.push(Inline::Break),
            other => return Err(format!("unsupported inline {}", node_type(other))),
        }
    }
    Ok(out)
}

fn is_break(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower == "<br>" || lower == "<br/>" || lower == "<br />"
}

fn read_list(list: &mdast::List, source: &str) -> Result<List, String> {
    let checks: Vec<Option<bool>> = list.children.iter().map(|item| match item { Node::ListItem(i) => i.checked, _ => None }).collect();
    let checklist = !list.ordered && !checks.is_empty() && checks.iter().all(|c| c.is_some());
    if !checklist && checks.iter().any(|c| c.is_some()) {
        return Err("partial or numbered checklist".into());
    }
    let mut delimiter = None;
    if list.ordered {
        // mdast has no delimiter; the source marker after the digits holds it (byte offsets).
        if let Some(Node::ListItem(first)) = list.children.first() {
            let start = first.position.as_ref().map(|p| p.start.offset).unwrap_or(0);
            let marker: String = source[start..].chars().skip_while(|c| c.is_ascii_digit()).take(1).collect();
            if marker == ")" {
                delimiter = Some(")".to_string());
            }
        }
    }
    let mut items = Vec::new();
    for item in &list.children {
        let Node::ListItem(item) = item else { return Err("list child".into()) };
        let mut index = 0;
        let mut content = Vec::new();
        if let Some(Node::Paragraph(paragraph)) = item.children.get(index) {
            content = inline(&paragraph.children, false)?;
            index += 1;
        }
        let mut nested = None;
        if let Some(Node::List(inner)) = item.children.get(index) {
            nested = Some(Box::new(read_list(inner, source)?));
            index += 1;
        }
        if index != item.children.len() {
            return Err("list item nesting".into());
        }
        items.push(ListItem { content, checked: if checklist { item.checked } else { None }, list: nested });
    }
    Ok(List {
        ordered: list.ordered,
        checklist: if checklist { Some(true) } else { None },
        start: if list.ordered { Some(list.start.unwrap_or(1)) } else { None },
        delimiter,
        items,
    })
}

fn read_table(table: &mdast::Table) -> Result<Table, String> {
    let mut rows = Vec::new();
    for (row_index, row) in table.children.iter().enumerate() {
        let Node::TableRow(row) = row else { return Err("table child".into()) };
        let mut cells = Vec::new();
        for (cell_index, cell) in row.children.iter().enumerate() {
            let Node::TableCell(cell) = cell else { return Err("row child".into()) };
            let align = match table.align.get(cell_index) {
                Some(mdast::AlignKind::Left) => Some("left".to_string()),
                Some(mdast::AlignKind::Center) => Some("center".to_string()),
                Some(mdast::AlignKind::Right) => Some("right".to_string()),
                _ => None,
            };
            cells.push(Cell { content: inline(&cell.children, true)?, header: row_index == 0, align });
        }
        rows.push(Row { cells });
    }
    Ok(Table { rows })
}
