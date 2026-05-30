use clap::Parser;
use curator::{run_server, ServeArgs};

#[derive(Parser, Debug)]
#[command(name = "curator-server", author = "Google DeepMind", version = "1.0", about = "Curator HTTP server runner")]
struct ServerCli {
    #[command(flatten)]
    serve: ServeArgs,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let cli = ServerCli::parse();
    run_server(cli.serve).await
}