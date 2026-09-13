use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=../src/plugins/rpc/runner.mjs");
    let extension = if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") { ".exe" } else { "" };
    let output = PathBuf::from("resources/plugin-runner").join(format!("cnrp-runner{extension}"));
    // tauri-build watches bundle resources (rerun-if-changed), so only write the exe when
    // stale; rewriting it every build triggers an infinite rebuild loop in cargo/tauri dev
    let source = PathBuf::from("../src/plugins/rpc/runner.mjs");
    let fresh = (|| {
        let source_modified = source.metadata().ok()?.modified().ok()?;
        let output_modified = output.metadata().ok()?.modified().ok()?;
        Some(output_modified >= source_modified)
    })()
    .unwrap_or(false);
    if !fresh {
        std::fs::create_dir_all(output.parent().unwrap()).expect("create plugin runner resource directory");
        let status = Command::new("bun")
            .args(["build", "../src/plugins/rpc/runner.mjs", "--compile", "--outfile"])
            .arg(&output)
            .status()
            .expect("Bun 1.3+ is required to build the bundled plugin runner");
        assert!(status.success() && output.is_file(), "failed to build bundled plugin runner");
    }
    tauri_build::build()
}
