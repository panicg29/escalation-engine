#!/usr/bin/env node

/**
 * Script to run regression tests and validate system performance
 * Usage: node scripts/run-regression-tests.js [--type=health|regression] [--json]
 */

import { runRegressionTests, quickHealthCheck } from "../lib/testing/regressionTests.js";

const args = process.argv.slice(2);
const testType = args.find(arg => arg.startsWith('--type='))?.split('=')[1] || 'regression';
const jsonOutput = args.includes('--json');

async function main() {
  try {
    console.log(`🚀 Running ${testType} tests...`);
    
    let result;
    if (testType === 'health') {
      result = await quickHealthCheck();
    } else if (testType === 'regression') {
      result = await runRegressionTests();
    } else {
      throw new Error(`Invalid test type: ${testType}. Use 'health' or 'regression'.`);
    }
    
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    }
    
    // Exit with appropriate code
    if (testType === 'health') {
      process.exit(result.status === 'healthy' ? 0 : 1);
    } else {
      process.exit(result.summary?.failed === 0 ? 0 : 1);
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error?.message);
    process.exit(1);
  }
}

main();