import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@finance/db', '@finance/parsers', '@finance/types'],
}

export default config
