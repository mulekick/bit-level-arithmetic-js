// import modules
import {chalk, table, DataViewAugmented, le, NUMBER_8_BITS, NUMBER_16_BITS, NUMBER_32_BITS, toFixedPoint, toRational, addInteger, subtractInteger, multiplyInteger, longDivideRational, dec2base, asciitbl, deepcopy, output, add, sub, mul, div} from "./lib.js";

const
    // =========== FORMAT OPERATION RESULTS ===============
    // native 64 bit floating point result
    // results presentation array
    // array column to fill
    // dataview containing operands and result
    // bit width of number representation
    // binary filler
    // integer read function
    // fixed point scale factor
    formatresults = (nres, a, col, view, nbits, f, getint, sf) => {
        const
            // convert to rational (fixed point)
            rat = toRational(getint.call(view, 8, le), sf),
            // correct ?
            fits = parseInt(nres) === parseInt(rat),
            prec = nres % 1 === rat % 1;

        let
            // init row
            row = 0;

        // format output
        // ------------------------------------------------
        a[row++][col] = `${ nbits } BIT, SCALE FACTOR ${ sf }`;
        a[row++][col] = `BINARY :`;
        a[row++][col] = `op1 : ${ dec2base(getint.call(view, 0, le), f, 2) }`;
        a[row++][col] = `op2 : ${ dec2base(getint.call(view, 4, le), f, 2) }`;
        a[row++][col] = `res : ${ dec2base(getint.call(view, 8, le), f, 2) }`;
        a[row++][col] = ``;
        a[row++][col] = `FIXED POINT RATIONAL :`;
        a[row++][col] = `op1 : ${ toRational(getint.call(view, 0, le), sf) }`;
        a[row++][col] = `op2 : ${ toRational(getint.call(view, 4, le), sf) }`;
        a[row++][col] = `res : ${ rat }`;
        a[row++][col] = ``;
        a[row++][col] = `MATCH NATIVE FLOAT 64 :`;
        a[row++][col] = `${ fits && prec ? `--> CORRECT` : fits ? `--> LOSS OF PRECISION` : `--> OVERFLOW` }`;
        // ------------------------------------------------

        // return
        return a;
    },

    // ========== RETRIEVE OPERANDS FROM PARAMS ===========
    // rational operands - replace underscores by negative values
    [ op1, op2 ] = process.argv.slice(2)
        .map(x => Number(x.replace(/_/u, `-`)));

try {

    const
        // check parameters
        input = isNaN(op1) === false &&
                isNaN(op2) === false;

    if (input === false)
        throw new TypeError(`please provide 2 unsigned numeric values (rational or integer).`);

    if (op2 === 0)
        throw new RangeError(`second value should not be zero.`);

    const
        // =================== DECLARATIONS ===================
        // create arraybuffers for 8, 16 and 32 bit values; each arraybuffer is 16 bytes long so we can use the same offsets
        [ b8, b16, b32 ] = [ new ArrayBuffer(16), new ArrayBuffer(16), new ArrayBuffer(16) ],
        // create dataviews
        views = [ new DataViewAugmented(b8), new DataViewAugmented(b16), new DataViewAugmented(b32) ],
        // init data types constants
        itc = [ NUMBER_8_BITS, NUMBER_16_BITS, NUMBER_32_BITS ];

    // =============== FIXED-POINT LIMITS ================
    process.stdout.write(chalk.black.bgBlue(`==== FIXED POINT VALID RANGE AND PRECISION LIMITS ====`));
    process.stdout.write(`\n`);
    process.stdout.write(`\n`);

    for (let i = 0; i < itc.length; i++) {
        const
            // extract data types constants
            {nbits, min, max, f, getint, setint, sf} = itc[i],
            // init table
            tbl = new table();

        // set min as int on dataview offset 0
        setint.call(views[i], 0, min, le);
        // set max as int on dataview offset 4
        setint.call(views[i], 4, max, le);

        tbl
            .setHeading([ `${ nbits } BIT, SCALE FACTOR ${ sf }`, `BINARY`, `RATIONAL` ])
            .addRowMatrix([
                [ `min valid value`, dec2base(getint.call(views[i], 0, le), f, 2), toRational(getint.call(views[i], 0, le), sf) ],
                [ `max valid value`, dec2base(getint.call(views[i], 4, le), f, 2), toRational(getint.call(views[i], 4, le), sf) ]
            ]);

        // log fixed point value limitations
        process.stdout.write(chalk.green(tbl.toString()));
        process.stdout.write(`\n`);

        // set op1 as int on dataview offset 0
        setint.call(views[i], 0, toFixedPoint(op1, sf), le);
        // set op2 as int on dataview offset 4
        setint.call(views[i], 4, toFixedPoint(op2, sf), le);
    }

    /*
    // binary fixed-point numbers can represent fractional powers of two exactly
    // but, like binary floating-point numbers, cannot exactly represent fractional powers of ten
    // so we have to check that both rational operands can be represented as a sum of power of two
    // if this is the case their initial floating-point point value will be equal to their floating-point value following conversion from fixed point value
    input = Float64Array.of(op1)[0] === toRational(itc[2][`getint`].call(views[2], 0, le), itc[2][`sf`]) &&
            Float64Array.of(op2)[0] === toRational(itc[2][`getint`].call(views[2], 4, le), itc[2][`sf`]);

    if (input === false)
        throw new Error(`both rational operands must be decomposed as sums of powers of 2 to be converted to fixed-point with no loss of precision.`);
    */

    // ============= FIXED-POINT ARITHMETIC ===============
    const
        // default native values
        [ addition, subtraction, multiplication, division ] = [ add, sub, mul, div ]
            .map(x => x(op1, op2));
    let
        // init array
        arr = asciitbl(3, 13);

    // ============== FIXED-POINT ADDITION ================
    // bitwise addition of the underlying integer representations of fixed point values
    // for each fixed-point representation
    for (let col = 0; col < itc.length; col++) {
        const
            // extract data types constants
            {nbits, f, sf, getint, setint} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le);

        // compute value, set as int on dataview offset 8
        setint.call(views[col], 8, addInteger(a, b), le);

        // fill array
        arr = formatresults(op1 + op2, arr, col, views[col], nbits, f, getint, sf);
    }
    // push into presentation array (arr will be passed by reference, so we have to deep copy it)
    addition.push(...deepcopy(arr));

    // ============ FIXED-POINT SUBTRACTION ===============
    // bitwise subtraction of the underlying integer representations of fixed point values
    // for each fixed-point representation
    for (let col = 0; col < itc.length; col++) {
        const
            // extract data types constants
            {nbits, f, sf, getint, setint} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le);

        // compute value, set as int on dataview offset 8
        setint.call(views[col], 8, subtractInteger(a, b), le);

        // fill array
        arr = formatresults(op1 - op2, arr, col, views[col], nbits, f, getint, sf);
    }
    // push into presentation array (arr will be passed by reference, so we have to deep copy it)
    subtraction.push(...deepcopy(arr));

    // ========== FIXED-POINT MULTIPLICATION ==============
    // bitwise multiplication of the underlying integer representations of fixed point values
    // v8 induced casting of values into uint32 for bit shifting will always produce an overflow when using 16 scale factor on 32 bits
    // all bits of the integer part of the result will end up being discarded to the left
    // for each fixed-point representation
    for (let col = 0; col < itc.length; col++) {
        const
            // extract data types constants
            {nbits, f, sf, getint, setint} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le);

        // compute value, set as int on dataview offset 8
        // eslint-disable-next-line no-bitwise
        setint.call(views[col], 8, multiplyInteger(a, b) >> sf, le);

        // fill array
        arr = formatresults(op1 * op2, arr, col, views[col], nbits, f, getint, sf);
    }
    // push into presentation array (arr will be passed by reference, so we have to deep copy it)
    multiplication.push(...deepcopy(arr));

    // ============= FIXED-POINT DIVISION =================
    // bitwise long division of the underlying integer representations of fixed point values
    // for each fixed-point representation
    for (let col = 0; col < itc.length; col++) {
        const
            // extract data types constants
            {nbits, f, sf, getint, setint} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le);

        // discarding divisor msb because of left shifting during fixed-point conversion may result in a division by 0
        if (b === 0)
            throw new RangeError(`The divisor is no longer valid after fixed-point conversion, aborting.`);

        // compute value, set as int on dataview offset 8
        setint.call(views[col], 8, longDivideRational(a, b, sf), le);

        // fill array
        arr = formatresults(op1 / op2, arr, col, views[col], nbits, f, getint, sf);
    }
    // push into presentation array (arr will be passed by reference, so we have to deep copy it)
    division.push(...deepcopy(arr));

    // print everything
    [ addition, subtraction, multiplication, division ]
        .forEach(output);

} catch (e) {
    process.stderr.write(chalk.bold.red(e[`message`]));
} finally {
    process.stdout.write(`\n`);
}