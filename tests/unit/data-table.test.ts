import { describe, it, expect } from 'vitest';
import { Column, DataTable } from '../../src/data-table/data-table';

describe('DataTable', () => {
  it('should create a DataTable with columns', () => {
    const xData = new Float32Array([1, 2, 3]);
    const yData = new Float32Array([4, 5, 6]);
    
    const dt = new DataTable([
      new Column('x', xData),
      new Column('y', yData)
    ]);
    
    expect(dt.numRows).toBe(3);
    expect(dt.columns.length).toBe(2);
    expect(dt.columns[0].name).toBe('x');
    expect(dt.columns[1].name).toBe('y');
  });

  it('should get column by index', () => {
    const xData = new Float32Array([1, 2, 3]);
    const dt = new DataTable([new Column('x', xData)]);
    
    const col = dt.getColumn(0);
    expect(col).toBeDefined();
    expect(col.name).toBe('x');
    expect(col.data).toEqual(xData);
  });

  it('should get column index by name', () => {
    const dt = new DataTable([
      new Column('x', new Float32Array([1, 2, 3])),
      new Column('y', new Float32Array([4, 5, 6]))
    ]);
    
    const index = dt.getColumnIndex('y');
    expect(index).toBe(1);
  });

  it('should throw error for empty DataTable', () => {
    expect(() => {
      new DataTable([]);
    }).toThrow('DataTable must have at least one column');
  });

  it('should throw error for inconsistent column lengths', () => {
    expect(() => {
      new DataTable([
        new Column('x', new Float32Array([1, 2, 3])),
        new Column('y', new Float32Array([4, 5])) // Different length
      ]);
    }).toThrow('inconsistent number of rows');
  });
});

describe('Column', () => {
  it('should create a column with data', () => {
    const data = new Float32Array([1, 2, 3]);
    const col = new Column('test', data);
    
    expect(col.name).toBe('test');
    expect(col.data).toEqual(data);
    expect(col.dataType).toBe('float32');
  });

  it('should detect correct data type', () => {
    const float32Col = new Column('float32', new Float32Array([1]));
    const float64Col = new Column('float64', new Float64Array([1]));
    const uint8Col = new Column('uint8', new Uint8Array([1]));
    const int32Col = new Column('int32', new Int32Array([1]));
    
    expect(float32Col.dataType).toBe('float32');
    expect(float64Col.dataType).toBe('float64');
    expect(uint8Col.dataType).toBe('uint8');
    expect(int32Col.dataType).toBe('int32');
  });

  it('should clone a column', () => {
    const data = new Float32Array([1, 2, 3]);
    const col = new Column('test', data);
    const cloned = col.clone();
    
    expect(cloned.name).toBe(col.name);
    expect(cloned.data).toEqual(col.data);
    expect(cloned.data).not.toBe(col.data); // Different reference
  });
});
