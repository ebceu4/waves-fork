import { setTimeout } from 'timers'
import { Observable, Subscription } from 'rxjs'

export const RecurringTask = <T>(delay: number, task: (done: (result?: T) => void) => T | void | Promise<T | void>): Observable<T> => {
  let id: NodeJS.Timer
  let disposed = false
  let lastRun = 0

  return new Observable<T>(observer => {

    const handle = () => {

      let doneCalled = false
      const doneCallback = (result?: T) => {

        if (doneCalled)
          return

        doneCalled = true

        if (result !== undefined) {
          observer.next(result)
        }

        if (!disposed) {
          const d = delay - (Date.now() - lastRun)
          if (d > 0) {
            id = setTimeout(handle, d)
          }
          else {
            process.nextTick(handle)
          }
        }
      }

      const timeout = setTimeout(() => doneCallback(), 10000)

      try {
        lastRun = Date.now()
        const result = task(r => { clearTimeout(timeout); doneCallback(r) })
      } catch (error) {

      }
    }

    if (!disposed)
      id = setTimeout(handle, delay)

    return new Subscription(() => {
      disposed = true
      clearTimeout(id)
    })
  })
}