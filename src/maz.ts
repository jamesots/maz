#!/usr/bin/env node
import * as sourceMapSupport from 'source-map-support';
import { main } from './cli';

sourceMapSupport.install();

process.exitCode = main(process.argv.slice(2));
