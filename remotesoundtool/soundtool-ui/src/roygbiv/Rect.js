import Vector2 from './Vector2';

export default class Rect {
  constructor({position, size} = {}) {
    this.position = new Vector2(position);
    this.size = new Vector2(size);
  }

  containsPoint(point) {
    if (
      // min
      point.x > this.position.x &&
      point.y > this.position.y &&
      // max
      point.x < this.position.x + this.size.x &&
      point.y < this.position.y + this.size.y
    ) {
      return true;
    }
    return false;
  }

  intersectsRect(other) {
    return collision(this, other);
  }

  clone() {
    return new Rect({position: this.position, size: this.size});
  }
}

function collision(a, b) {
  // work out the corners (x1,x2,y1,y1) of each rectangle
  // top left
  let ax1 = a.position.x;
  let ay1 = a.position.y;
  // bottom right
  let ax2 = a.position.x + a.size.x;
  let ay2 = a.position.y + a.size.y;
  // top left
  let bx1 = b.position.x;
  let by1 = b.position.y;
  // bottom right
  let bx2 = b.position.x + b.size.x;
  let by2 = b.position.y + b.size.y;

  // test rectangular overlap
  return !(ax1 > bx2 || bx1 > ax2 || ay1 > by2 || by1 > ay2);
}
