fn main() {
    let args: Vec<_> = std::env::args().collect();
    let input = if let Some(path) = args.get(1) {
        std::fs::read_to_string(path).expect("project file")
    } else {
        std::io::read_to_string(std::io::stdin()).expect("stdin")
    };
    let result = workbench_model::Project::parse(&input).and_then(|p| {
        workbench_assembly::analyse(&p, args.get(2).map(|s| s.as_str()).unwrap_or("LC1"))
    });
    match result {
        Ok(r) => println!("{}", serde_json::to_string(&r).unwrap()),
        Err(d) => {
            println!(
                "{}",
                serde_json::json!({"status":"error","diagnostics":[d]})
            );
            std::process::exit(1)
        }
    }
}
