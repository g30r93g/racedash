export class InsufficientCreditsError extends Error {
  public readonly available: number
  public readonly requested: number

  constructor(available: number, requested: number) {
    super(`Insufficient credits: requested ${requested} RC but only ${available} RC available`)
    this.name = 'InsufficientCreditsError'
    this.available = available
    this.requested = requested
  }
}
