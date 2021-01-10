# Bit-level implementation of arithmetic operations in Javascript

I'm soon going to begin to learn C language and as a warmup, I tried to familiarize myself with a few core CS concepts that I know are widely used in C : data types, memory allocation, and bitwise operations. To achieve this, I did a bit-level implementation of the basic arithmetic operators for different numeric data types using what I know best : javascript and google v8 engine.

The point in using a technology clearly unfit for such an exercise is that writing the exact same implementation in C will for sure be a walk in the park after that. I actually intend to do it once I'll master the fundamentals.

I also think that it can have some educative value for beginners who have just a bare node.js / express education as it will get them acquainted with bitwise operators, typed arrays, dataviews, arraybuffers and other low-level v8 concepts that may help them transition to some more low-level programming languages if they wish to.

## how to install

Navigate to your install directory and type :
- git clone https://github.com/mulekick/bit-shift-arithmetic

## how to run
When in the directory, type :

- **npm run iar n1 n2** : runs the 4 basic arithmetic operations using integer representations of the operands
- **npm run far n1 n2** : runs the 4 basic arithmetic operations using fixed point representations of the operands
- **npm run flr n1 n2** : runs the 4 basic arithmetic operations using floating point representations of the operands

- n1 and n2 have to be real numbers in any numeral system, scientific notation is allowed thanks to google v8 (though only if operand is in base 10)
- all results will be returned using the same representation that was used for the operands (integer operands will return integer, floating point will return floating point, etc...)
- if you want to use negative operands, replace the minus sign by an underscore (mandatory so as npm does not mistake it for a command line option) 

## arithmetic operators implemented are

1. addition
2. subtraction
3. multiplication
4. euclidian division (for integers)
5. long division

## possible operands data types are

1. 8, 16 and 32 bit signed integers
2. 8, 16 and 32 bit signed fixed point real numbers
3. 16 and 32 bit signed floating point real numbers

## notes
- Of course, since we are limited by the computer's available memory to begin with, we can only talk about **approximations** of real numbers, except for those that can be represented exactly (ie. the subset of real numbers that have a finite decimal expansion **and** can be decomposed as a sum of powers of two).
- Also, **the rounding is not implemented** on results that have a fractional part. I may implement some IEEE_754 compliant rounding at a later stage, but since I don't intend to build a full blown implementation, I feel that I've done enough for now. The missing rounding will be accounted for as part of the precision loss when the result is compared to the native google v8's 64 bit floating point implementation's result for the same operation.
- For more details about the algorithms used and the general constraints imposed by this exercise, see the head comment in lib.js
- Last but not least, thanks to @petamoriken for providing the 16 bit floating point v8 implementation ! check it at https://github.com/petamoriken/float16