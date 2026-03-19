import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'

export interface RaceDashConfig {
  env: string
  uploadsBucketName: string
  rendersBucketName: string
  remotionSiteBucketName: string
}

export function getConfig(scope: Construct): RaceDashConfig {
  const env = scope.node.tryGetContext('env') || 'dev'

  return {
    env,
    uploadsBucketName: `racedash-uploads-${env}`,
    rendersBucketName: `racedash-renders-${env}`,
    remotionSiteBucketName: `racedash-remotion-site-${env}`,
  }
}

export function getContextParam(scope: Construct, key: string, defaultValue?: string): string {
  const value = scope.node.tryGetContext(key)
  if (value !== undefined) return value
  if (defaultValue !== undefined) return defaultValue
  return ''
}
