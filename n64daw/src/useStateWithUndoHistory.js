import React, {useState, useRef} from 'react';

function last(arr) {
  return arr[arr.length - 1];
}

class StateHistory {
  // array stack of previous states + current state (current state last)
  _history = [];
  // array stack of undone states (most recently undone state last)
  _forwardHistory = [];

  // setState function to call when state updates
  stateSubscriber = () => {};

  // to decide whether a state commit should replace an optimistic update,
  // track whether the last update was optimistic or commit
  _lastUpdateType = 'commit';

  // incrementing counter for state versions
  // for debugging only
  _stateID = 0;

  constructor(initializer, opts) {
    this.initState(
      typeof initializer === 'function' ? initializer() : initializer
    );
    this._opts = opts;
  }

  _emitChange() {
    this.stateSubscriber(last(this._history));
  }

  initState(state) {
    if (this._history.length !== 0) {
      throw new Error(`history already initialized`);
    }

    this._pushStateVersion(state);
  }

  _pushStateVersion(state) {
    this._history.push(this._createStateVersion(state));
  }
  _replaceStateVersion(state) {
    this._history[this._history.length - 1] = this._createStateVersion(state);
  }
  _createStateVersion(state) {
    return {
      id: this._stateID++, // state version id for debugging only
      state,
    };
  }
  _unwrapStateVersion(stateVersion) {
    return stateVersion.state;
  }
  _getState() {
    return this._unwrapStateVersion(last(this._history));
  }
  getCurrentStateVersion() {
    return last(this._history);
  }

  setOpts(opts) {
    this._opts = opts;
  }

  undo = () => {
    // remove stack top to move back to (new) current state,
    // add to forward history in case we want to redo
    // we must always have at least one item (current) in history
    if (
      this._history.length > 1 &&
      // validate state change
      this._opts.validateHistoryChange
        ? this._opts.validateHistoryChange(
            this._unwrapStateVersion(this._history[this._history.length - 2]),
            'undo'
          )
        : true
    ) {
      this._forwardHistory.push(this._history.pop());
      this._lastUpdateType = 'commit';
      this._emitChange();
    }
  };

  redo = () => {
    // if we have forward history, move it to the history and apply as state
    if (
      this._forwardHistory.length &&
      // validate state change
      this._opts.validateHistoryChange
        ? this._opts.validateHistoryChange(
            this._unwrapStateVersion(last(this._forwardHistory)),
            'redo'
          )
        : true
    ) {
      this._history.push(this._forwardHistory.pop());
      this._lastUpdateType = 'commit';
      this._emitChange();
    }
  };

  pushState = (updater) => {
    const prevState = this._getState();
    const newState =
      typeof updater === 'function' ? updater(prevState) : updater;

    // erase forward history now that we're creating a new branch
    this._forwardHistory = [];
    // push new state version to history
    this._pushStateVersion(newState);
    this._emitChange();
  };

  replaceState = (updater) => {
    const prevState = this._getState();
    const newState =
      typeof updater === 'function' ? updater(prevState) : updater;

    // erase forward history now that we're creating a new branch
    this._forwardHistory = [];
    // override current state
    this._replaceStateVersion(newState);
    this._emitChange();
  };

  setStateWithOptimisticUpdates = (updater, {updateType}) => {
    if (!(updateType === 'optimistic' || updateType === 'commit')) {
      throw new Error(`invalid updateType: ${updateType}`);
    }
    // the first optimistic update after a commit will create a new history state
    // but otherwise optimistic updates will always be replaced by any subsequent update
    if (this._lastUpdateType === 'commit') {
      this.pushState(updater);
    } else {
      this.replaceState(updater);
    }
    this._lastUpdateType = updateType;
  };
}

export default function useStateWithUndoHistory(initializer, opts) {
  const historyRef = useRef(null);
  if (!historyRef.current) {
    historyRef.current = new StateHistory(initializer, opts);
  }
  historyRef.current.setOpts(opts);
  const [state, setState] = useState(
    historyRef.current.getCurrentStateVersion()
  );
  historyRef.current.stateSubscriber = setState;

  return [
    state.state,
    historyRef.current.setStateWithOptimisticUpdates,
    historyRef.current,
  ];
}
