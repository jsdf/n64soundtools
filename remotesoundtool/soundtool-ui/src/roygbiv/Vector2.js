export default class Vector2 {
  constructor({x, y} = {}) {
    this.x = x ?? 0;
    this.y = y ?? 0;
  }

  clone() {
    return new Vector2(this);
  }

  copyFrom({x, y} = {}) {
    this.x = x ?? 0;
    this.y = y ?? 0;
  }

  origin() {
    this.x = 0;
    this.y = 0;
  }

  add(other) {
    this.x += other.x;
    this.y += other.y;
    return this;
  }

  sub(other) {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  }

  mul(other) {
    this.x *= other.x;
    this.y *= other.y;
    return this;
  }

  div(other) {
    this.x /= other.x;
    this.y /= other.y;
    return this;
  }

  distanceTo(other) {
    return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
  }

  toJSON() {
    return {x: this.x, y: this.y};
  }
}
