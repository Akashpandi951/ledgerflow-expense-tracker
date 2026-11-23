import { createApp } from '../src/app';

const app = createApp('vercel-serverless');

export = Object.assign(app, { default: app });
