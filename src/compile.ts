import * as fs from "fs";
import * as path from "path";

/**
 * Compile a Solidity contract using the solc compiler.
 * Returns the compiler output JSON.
 */
export function compileSol(contractPath: string): {
  abi: unknown[];
  bytecode: string;
  contractName: string;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const solc = require("solc");

  const absolutePath = path.resolve(contractPath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const fileName = path.basename(absolutePath);

  const input = {
    language: "Solidity",
    sources: {
      [fileName]: { content: source },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const severe = output.errors.filter(
      (e: { severity: string }) => e.severity === "error"
    );
    if (severe.length > 0) {
      const messages = severe.map(
        (e: { formattedMessage: string }) => e.formattedMessage
      );
      throw new Error(`Solidity compilation errors:\n${messages.join("\n")}`);
    }
  }

  const contracts = output.contracts[fileName];
  const contractName = Object.keys(contracts)[0];
  const contract = contracts[contractName];

  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
    contractName,
  };
}

/** Write compiled ABI and bytecode to an output directory */
export function compileAndWrite(
  contractPath: string,
  outDir: string
): { abiPath: string; bytecodePath: string } {
  const { abi, bytecode, contractName } = compileSol(contractPath);

  fs.mkdirSync(outDir, { recursive: true });

  const abiPath = path.join(outDir, `${contractName}.abi.json`);
  const bytecodePath = path.join(outDir, `${contractName}.bin`);

  fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));
  fs.writeFileSync(bytecodePath, bytecode);

  return { abiPath, bytecodePath };
}

/* CLI entry point */
if (require.main === module) {
  const contractFile =
    process.argv[2] || path.join(__dirname, "..", "contracts", "MultiModelTradeLog.sol");
  const outDir = process.argv[3] || path.join(__dirname, "..", "artifacts");

  console.log(`Compiling ${contractFile} ...`);
  const { abiPath, bytecodePath } = compileAndWrite(contractFile, outDir);
  console.log(`ABI  → ${abiPath}`);
  console.log(`BIN  → ${bytecodePath}`);
}
