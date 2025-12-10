import { DataTable } from '../data-table';
import { DataSink } from '../io/data-sink';

const writeCsv = async (sink: DataSink, dataTable: DataTable) => {
    const encoder = new TextEncoder();
    const len = dataTable.numRows;

    // write header
    await sink.write(encoder.encode(`${dataTable.columnNames.join(',')}\n`));

    const columns = dataTable.columns.map(c => c.data);

    // write rows
    for (let i = 0; i < len; ++i) {
        let row = '';
        for (let c = 0; c < dataTable.columns.length; ++c) {
            if (c) row += ',';
            row += columns[c][i];
        }
        await sink.write(encoder.encode(`${row}\n`));
    }
};

export { writeCsv };
