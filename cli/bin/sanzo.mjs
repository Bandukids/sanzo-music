#!/usr/bin/env node
import {run} from '../lib/main.mjs';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
process.exitCode = await run(process.argv.slice(2), {signal: controller.signal});
