
// Data types

type PathName = string;

type Implementation = PathName;

type TestSuite = PathName;

interface Test {
    loc: string;
    passed: boolean;
}

interface TestBlock {
    name: string,
    loc: string,
    error: boolean,
    tests: Test[],
}

enum Err {
    Unknown = "Unknown",
    Compilation = "Compilation",
    OutOfMemory = "OutOfMemory",
    Timeout = "Timeout",
    Runtime = "Runtime",
}

interface Result {
    Ok?: TestBlock[],
    Err?: string
}

interface Evaluation {
    code: Implementation;
    tests: TestSuite;
    result: Result;
}

// Gradescope types

interface GradescopeReport {
    visibility: string;
    stdout_visibility: string;
    tests: GradescopeTestReport[];
}

interface GradescopeTestReport {
    name: string;
    score: number;
    max_score: number;
    output: string;
    visibility: string;
}


// Implementation


// Input/output

function read_evaluation_from_file(path: PathName): Evaluation[] {
    let fs = require('fs');
    let contents = fs.readFileSync(path);
    return JSON.parse(contents);
}

function write_report_to_file(path: PathName, report: GradescopeReport) {
    let fs = require('fs');
    let data: string = JSON.stringify(report);
    fs.writeFileSync(path, data);
    console.log("Wrote output to " + path);
}


// Counts number of passed tests / total tests
function summarize_results(result: TestBlock[]): [number, number] {
    let total_tests: number = result
        .map(block => block.tests.length)
        .reduce((a, b) => a + b);
    let passed_tests: number = result
        .map(block => block.tests.filter(test => test.passed).length)
        .reduce((a, b) => a + b);
    return [passed_tests, total_tests];
}

// Gets the name a file from path
function get_file_name(path_name: PathName): string {
    let path = require('path');
    return path.parse(path_name).base;
}

// Generate Gradescope reports for functionality, wheats, and chaffs

function generate_functionality_report(test_result: Evaluation): GradescopeTestReport[] {
    // If errors, 0 functionality and provide error reason
    let result: Result = test_result.result;

    if (result.Err) {
        return [{
                "name": get_file_name(test_result.code),
                "score": 0,
                "max_score": 1,
                "output": `Error: ${result}`,
                "visibility": "visible"
            }];
    }


    // If no error, report number of passed tests in each block
    let reports: GradescopeTestReport[] = [];

    let block: TestBlock;
    for (block of result.Ok) {
        let report: GradescopeTestReport;
        if (block.error) {
            report = {
                    "name": block.name,
                    "score": 0,
                    "max_score": 1,
                    "output": "Block errored.",
                    "visibility": "after_published"
                };
        } else {
            let total_tests: number = block.tests.length;
            let passed_tests: number = block.tests.filter(test => test.passed).length;
            report = {
                    "name": block.name,
                    "score": passed_tests === total_tests ? 1 : 0,
                    "max_score": 1,
                    "output": passed_tests === total_tests 
                        ? `Passed all ${total_tests} tests in this block!`
                        : `Missing ${total_tests - passed_tests} tests in this block`,
                    "visibility": "after_published"
                };
        }

        reports.push(report);
    }

    return reports;
}



function generate_wheat_report(wheat_result: Evaluation): GradescopeTestReport {
    let result: Result = wheat_result.result;

    let passed_wheat: boolean;
    if (result.Err) {
        // If errors, then wheat failed
        passed_wheat = false;
    } else {
        // Otherwise, wheat passed iff all tests passed
        let [passed_tests, total_tests]: [number, number] = summarize_results(result.Ok);
        passed_wheat = passed_tests === total_tests;
    }

    return {
            "name": get_file_name(wheat_result.code),
            "score": passed_wheat ? 1 : 0,
            "max_score": 1,
            "output": passed_wheat ? `Passed wheat!` : `Failed wheat.`,
            "visibility": "after_published"
        }
}

function generate_chaff_report(chaff_result: Evaluation): GradescopeTestReport {
    let result: Result = chaff_result.result;

    let caught_chaff: boolean;
    if (result.Err) {
        // If errors, then chaff caught
        caught_chaff = true;
    } else {
        // Otherwise, chaff caught iff some test fails
        let [passed_tests, total_tests]: [number, number] = summarize_results(result.Ok);
        caught_chaff = passed_tests < total_tests;
    }

    return {
            "name": get_file_name(chaff_result.code),
            "score": caught_chaff ? 1 : 0,
            "max_score": 1,
            "output": caught_chaff ? `Caught chaff!` : `Didn't catch chaff.`,
            "visibility": "after_published"
        }
}



function main() {
    // Parse command line arguments
    let args: string[] = process.argv.slice(2);

    if (args.length != 2) {
        throw("Usage: <infile> <outfile>");
    }

    let infile: string = args[0],
        outfile: string = args[1];

    // Parse autograder json output
    let results: Evaluation[] = read_evaluation_from_file(infile);


    // Split up evaluations into test, wheat, and chaff results
    let test_results: Evaluation[] = [],
        wheat_results: Evaluation[] = [],
        chaff_results: Evaluation[] = [];

    let result: Evaluation;
    for (result of results) {
        if (result.code.includes("wheat")) { 
            wheat_results.push(result) 

        } else if (result.code.includes("chaff")) { 
            chaff_results.push(result) 

        } else { 
            test_results.push(result) 
        }
    };

    // Generate reports
    let functionality_reports: GradescopeTestReport[][] = test_results.map(generate_functionality_report),
        wheat_test_reports: GradescopeTestReport[] = wheat_results.map(generate_wheat_report),
        chaff_test_reports: GradescopeTestReport[] = chaff_results.map(generate_chaff_report);

    let gradescope_report: GradescopeReport = {
                "visibility": "after_published",
                "stdout_visibility": "after_published",
                "tests": [].concat(
                    wheat_test_reports,
                    chaff_test_reports,
                    ...functionality_reports)
            };


    // Write report to outfile
    write_report_to_file(outfile, gradescope_report);
}

main();
