import React from 'react';
import useRefOnce from './useRefOnce';

const {useEffect} = React;

export class BehaviorController {
  behaviors = {};
  eventTypes = new Set();
  boundEventTypes = new Set();
  locks = {};

  // behaviors can call this to try to get exclusive control of some resource
  // (eg. dragging). they will receive it if only a lower pri behavior (or no
  // behavior) owns it
  acquireLock(type, behavior, priority) {
    if (this.hasLock(type, behavior)) {
      return true;
    }

    if (this.locks[type] && this.locks[type].priority < priority) {
      this.releaseLock(type);
    }

    if (!this.locks[type]) {
      this.locks[type] = {behavior, priority};
      Object.values(this.behaviors).forEach((behavior) => {
        behavior.onAnyLockChange(type, true);
      });
      return true;
    }
    return false;
  }

  hasLock(type, behavior) {
    return this.locks[type]?.behavior === behavior;
  }

  lockExists(type) {
    return this.locks[type] != null;
  }

  releaseLock(type) {
    if (!this.locks[type]) return;
    this.locks[type].behavior.onReleaseLock(type);
    this.locks[type] = null;
    Object.values(this.behaviors).forEach((behavior) => {
      behavior.onAnyLockChange(type, false);
    });
  }

  handleEvent = (e) => {
    Object.keys(this.behaviors)
      .sort((aKey, bKey) => {
        const a = this.behaviors[aKey];
        const b = this.behaviors[bKey];
        return b.priority - a.priority;
      })
      .forEach((behaviorName) => {
        const behavior = this.behaviors[behaviorName];
        const behaviorEventSubscription = behavior.eventHandlers[e.type];

        if (behaviorEventSubscription && behavior.enabled) {
          behaviorEventSubscription(e, this);
        }
      });
  };

  addBehavior(name, BehaviorClass, priority) {
    if (this.behaviors[name])
      throw new Error(`already a behavior named ${name}`);
    const behavior = new BehaviorClass(this, name, priority);
    behavior.eventHandlers = behavior.getEventHandlers();
    this.behaviors[name] = behavior;

    // add new event types
    Object.keys(behavior.eventHandlers).forEach((eventType) =>
      this.eventTypes.add(eventType)
    );

    // if already bound to canvas, we need to ensure the correct set of handlers
    // are bound
    const canvas = this.canvas;
    if (canvas) {
      this.unbind();
      this.bind(canvas);
    }
  }

  bind(canvas) {
    this.canvas = canvas;

    this.eventTypes.forEach((type) => {
      this.canvas.addEventListener(type, this.handleEvent);
    });
    this.boundEventTypes = new Set(this.eventTypes);
  }

  unbind() {
    if (!this.canvas) return;

    this.boundEventTypes.forEach((type) => {
      this.canvas.removeEventListener(type, this.handleEvent);
    });
    this.boundEventTypes = new Set();

    this.canvas = null;
  }
}

export class Behavior {
  enabled = true;
  props = {};

  constructor(controller, name, priority) {
    this.controller = controller;
    this.name = name;
    this.priority = priority;
  }

  setProps(props) {
    this.receiveProps(this.props, props);
    this.props = props;
  }

  receiveProps(prevProps, props) {}

  setEnabled(enabled) {
    if (this.enabled !== enabled) {
      if (enabled) {
        this.onEnabled();
      } else {
        // release any locks held by this behavior
        Object.keys(this.controller.locks).forEach((type) => {
          if (this.controller.hasLock(type, this)) {
            this.controller.releaseLock(type);
          }
        });
        this.onDisabled();
      }

      this.enabled = enabled;
    }
  }

  // return a map of event handlers
  getEventHandlers() {
    return {};
  }

  // run when lock for this behavior is released or lost due to
  // priority. use to clean up lock state
  onReleaseLock(type) {}

  // run when changing from enabled to disabled
  onEnabled() {}
  onDisabled() {}

  acquireLock(lock) {
    return this.controller.acquireLock(lock, this, this.priority);
  }
  releaseLock(lock) {
    if (this.hasLock(lock)) {
      this.controller.releaseLock(lock);
    }
  }
  hasLock(lock) {
    return this.controller.hasLock(lock, this);
  }
  get canvas() {
    return this.controller.canvas;
  }
  onAnyLockChange(type, locked) {}
}

export function useBehaviors(makeBehaviors, {canvas, props, enabled}) {
  const controllerRef = useRefOnce(makeBehaviors);
  const controller = controllerRef.current;
  useEffect(() => {
    Object.keys(props ?? {}).forEach((behaviorName) => {
      controller.behaviors[behaviorName].setProps(props[behaviorName]);
    });
    Object.keys(enabled ?? {}).forEach((behaviorName) => {
      if (enabled[behaviorName] != null) {
        controller.behaviors[behaviorName].setEnabled(enabled[behaviorName]);
      }
    });
  });
  useEffect(() => {
    if (!canvas) return;
    controller.bind(canvas);
    return () => {
      controller.unbind();
    };
  }, [canvas, controller]);
}
