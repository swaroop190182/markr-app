// The bottleneck rule lives in one place, shared with the server (report email):
// api/_lib/bottleneck.ts. A dimension is only "the bottleneck" when it scores below 7.
export * from '../../api/_lib/bottleneck.ts'
