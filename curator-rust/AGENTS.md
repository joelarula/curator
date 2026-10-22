# curator-rust rules
- Check: `cargo check --manifest-path curator-rust/Cargo.toml`; run: `cargo run ... -- serve --port 8080`.
- Owns its API and model lifecycle; no hardcoded model paths (use env).
- Verify endpoint compatibility before UI assumptions.
