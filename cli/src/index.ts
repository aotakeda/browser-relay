#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { spawn } from "child_process";
import { createLogForwarder } from "./log-forwarder";

const program = new Command();

interface CaptureOptions {
  port?: string;
  server?: string;
  silent?: boolean;
  name?: string;
}

program
  .name("local-lens")
  .description(
    "Universal CLI tool to capture server logs from any backend framework"
  )
  .version("0.1.0");

program
  .command("capture")
  .description("Capture logs from any server command")
  .argument(
    "<command>",
    'The server command to run (e.g., "rails server", "npm start")'
  )
  .argument("[args...]", "Additional arguments for the command")
  .option("-p, --port <port>", "Local Lens server port", "27497")
  .option(
    "-s, --server <url>",
    "Local Lens server URL",
    "http://localhost:27497"
  )
  .option("--silent", "Suppress Local Lens output messages", false)
  .option("-n, --name <name>", "Name for this process in logs")
  .action(async (command: string, args: string[], options: CaptureOptions) => {
    try {
      await captureCommand(command, args, options);
    } catch (error) {
      console.error(
        chalk.red("❌ Error:"),
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Check Local Lens server status")
  .option(
    "-s, --server <url>",
    "Local Lens server URL",
    "http://localhost:27497"
  )
  .action(async (options: { server?: string }) => {
    const serverUrl = options.server || "http://localhost:27497";
    try {
      const response = await fetch(`${serverUrl}/health-local-lens`);
      if (response.ok) {
        console.log(chalk.green("✅ Local Lens server is running"));
        console.log(chalk.gray(`   Server: ${serverUrl}`));
      } else {
        console.log(chalk.red("❌ Local Lens server responded with error"));
      }
    } catch (error) {
      console.log(chalk.red("❌ Local Lens server is not running"));
      console.log(chalk.gray(`   Server: ${serverUrl}`));
      console.log(
        chalk.gray(
          `   Error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        )
      );
    }
  });

async function captureCommand(
  command: string,
  args: string[],
  options: CaptureOptions
) {
  const serverUrl = options.server || "http://localhost:27497";
  const processName = options.name || command.split(" ")[0];

  if (!options.silent) {
    console.log(chalk.blue("🔍 Local Lens CLI"));
    console.log(chalk.gray(`   Capturing: ${command} ${args.join(" ")}`));
    console.log(chalk.gray(`   Server: ${serverUrl}`));
    console.log(chalk.gray(`   Process name: ${processName}`));
    console.log("");
  }

  // Check if Local Lens server is running
  try {
    const healthResponse = await fetch(`${serverUrl}/health-local-lens`);
    if (!healthResponse.ok) {
      throw new Error("Server not healthy");
    }
  } catch (error) {
    console.error(error);
    console.error(chalk.red("❌ Local Lens server is not running"));
    console.error(chalk.gray(`   Please start the Local Lens server first`));
    console.error(chalk.gray(`   Expected server at: ${serverUrl}`));
    process.exit(1);
  }

  // Initialize log forwarder
  const logForwarder = createLogForwarder(
    serverUrl,
    processName,
    !options.silent
  );

  // Parse command and arguments
  const [cmd, ...cmdArgs] = command.split(" ").concat(args);

  if (!options.silent) {
    console.log(chalk.green("🚀 Starting server..."));
  }

  // Spawn the server process
  const serverProcess = spawn(cmd, cmdArgs, {
    stdio: ["inherit", "pipe", "pipe"],
    shell: true,
  });

  // Handle process start
  serverProcess.on("spawn", () => {
    if (!options.silent) {
      console.log(chalk.green(`✅ Server started (PID: ${serverProcess.pid})`));
      console.log(chalk.gray("   Capturing logs... Press Ctrl+C to stop"));
      console.log("");
    }
  });

  // Capture stdout (normal logs)
  if (serverProcess.stdout) {
    serverProcess.stdout.on("data", (data) => {
      const output = data.toString();
      // Forward to Local Lens
      logForwarder.forwardLog("log", output);
      // Also display locally
      process.stdout.write(output);
    });
  }

  // Capture stderr (error logs)
  if (serverProcess.stderr) {
    serverProcess.stderr.on("data", (data) => {
      const output = data.toString();
      // Forward to Local Lens
      logForwarder.forwardLog("error", output);
      // Also display locally
      process.stderr.write(output);
    });
  }

  // Handle process exit
  serverProcess.on("exit", (code, signal) => {
    if (!options.silent) {
      if (code === 0) {
        console.log(chalk.green(`\n✅ Server exited normally`));
      } else if (signal) {
        console.log(
          chalk.yellow(`\n⚠️  Server terminated by signal: ${signal}`)
        );
      } else {
        console.log(chalk.red(`\n❌ Server exited with code: ${code}`));
      }
    }
    process.exit(code || 0);
  });

  // Handle process errors
  serverProcess.on("error", (error) => {
    console.error(chalk.red("\n❌ Failed to start server:"), error.message);
    process.exit(1);
  });

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    if (!options.silent) {
      console.log(chalk.yellow("\n⚡ Stopping server..."));
    }
    serverProcess.kill("SIGTERM");

    // Force kill after 5 seconds
    setTimeout(() => {
      if (!serverProcess.killed) {
        serverProcess.kill("SIGKILL");
      }
    }, 5000);
  });

  // Handle other termination signals
  process.on("SIGTERM", () => {
    serverProcess.kill("SIGTERM");
  });
}

if (require.main === module) {
  program.parse();
}

export { program };
