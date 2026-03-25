import * as cdk from 'aws-cdk-lib'
import * as ses from 'aws-cdk-lib/aws-ses'
import { Construct } from 'constructs'
import { getConfig, getContextParam } from '../config'

export class NotificationsStack extends cdk.Stack {
  public readonly sesFromAddress: string
  public readonly sesIdentityArn: string

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const config = getConfig(this)
    this.sesFromAddress = getContextParam(this, 'sesFromAddress', `noreply@racedash.io`)

    const emailIdentity = new ses.EmailIdentity(this, 'RaceDashEmailIdentity', {
      identity: ses.Identity.email(this.sesFromAddress),
    })

    this.sesIdentityArn = `arn:aws:ses:${this.region}:${this.account}:identity/${this.sesFromAddress}`

    // Stack outputs
    new cdk.CfnOutput(this, 'SesFromAddress', {
      value: this.sesFromAddress,
      exportName: `${config.env}-SesFromAddress`,
    })
    new cdk.CfnOutput(this, 'SesIdentityArn', {
      value: this.sesIdentityArn,
      exportName: `${config.env}-SesIdentityArn`,
    })
  }
}
