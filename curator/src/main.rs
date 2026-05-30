use clap::{Parser, Subcommand};
use curator::{create_app_state, init_tracing, read_prompt_input, server, ServeArgs};

#[derive(Parser, Debug)]
#[command(name = "curator", author = "Google DeepMind", version = "1.0", about = "Curator command and server runner powered by the curator library")]
struct Cli {
    #[command(flatten)]
    serve: ServeArgs,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand, Debug)]
enum Commands {
    Serve(ServeCommand),
    Prompt(PromptArgs),
}

#[derive(Parser, Debug, Clone)]
struct ServeCommand {
    #[command(flatten)]
    serve: ServeArgs,
}

#[derive(Parser, Debug, Clone)]
struct PromptArgs {
    /// Prompt text or a path to a file containing the prompt
    input: String,

    /// Treat input as literal text even if it matches a local file path
    #[arg(long)]
    literal: bool,

    /// Model name to echo in responses / request metadata
    #[arg(long, default_value = "local-gemma-3-1b-it")]
    request_model: String,

    /// Print full JSON response instead of only assistant content
    #[arg(long)]
    json: bool,

    #[command(flatten)]
    serve: ServeArgs,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    init_tracing();
    let cli = Cli::parse();

    match cli.command {
        None => curator::run_server(cli.serve).await?,
        Some(Commands::Serve(args)) => curator::run_server(args.serve).await?,
        Some(Commands::Prompt(args)) => run_prompt(args).await?,
    }

    Ok(())
}

async fn run_prompt(args: PromptArgs) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let prompt = read_prompt_input(&args.input, args.literal)?;
    let state = create_app_state(args.serve).await?;
    let response = server::run_chat_completion(
        state,
        server::ChatCompletionRequest {
            model: args.request_model,
            messages: vec![server::ChatMessage {
                role: "user".to_string(),
                content: prompt,
            }],
            temperature: None,
            max_tokens: None,
            top_k: None,
            top_p: None,
            repeat_penalty: None,
        },
    )
    .await
    .map_err(|e| format!("Prompt execution failed: {}", e))?;

    if args.json {
        println!("{}", serde_json::to_string_pretty(&response)?);
    } else if let Some(choice) = response.choices.first() {
        println!("{}", choice.message.content);
    }

    Ok(())
}
