class OpenPromise {
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

// a promise-based request/response abstraction on top of messages
class RequestMap {
  map = new Map();
  handleRequest(requestID) {
    const openPromise = new OpenPromise();
    this.map.set(requestID, openPromise);
    return openPromise.promise;
  }

  handleResponse(requestID, payload, isError = false) {
    const toResolve = this.map.get(requestID);
    this.map.delete(requestID);
    if (!toResolve) {
      console.error(
        'got response with no matching request',
        requestID,
        payload
      );
    } else {
      if (isError) {
        debugger;
        toResolve.reject(payload);
      } else {
        toResolve.resolve(payload);
      }
    }
  }
}

module.exports = RequestMap;
