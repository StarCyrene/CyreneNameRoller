use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=../src/plugins/rpc/runner.mjs");
    let extension = if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") { ".exe" } else { "" };
    let output = PathBuf::from("resources/plugin-runner").join(format!("cnrp-runner{extension}"));
    std::fs::create_dir_all(output.parent().unwrap()).expect("create plugin runner resource directory");
    let status = Command::new("bun")
        .args(["build", "../src/plugins/rpc/runner.mjs", "--compile", "--outfile"])
        .arg(&output)
        .status()
        .expect("Bun 1.3+ is required to build the bundled plugin runner");
    assert!(status.success() && output.is_file(), "failed to build bundled plugin runner");
    tauri_build::build()
}
