
/********************\
***** Data Types *****
\********************/

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

interface PointData {
    functionality: Map<string, number>;
    testing: Map<string, number>;
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


/************************\
***** Implementation *****
\************************/


/********************\
*** Handling input ***
\********************/

function parse_command_line(): [string, string, string] {
    // Parse command line arguments
    let args: string[] = process.argv.slice(2);

    if (args.length != 3) {
        throw("Usage: <infile> <outfile> <scorefile>");
    }

    return [args[0], args[1], args[2]];
}

function read_evaluation_from_file(path: PathName): Evaluation[] {
    let fs = require('fs');
    let contents: string = fs.readFileSync(path);
    return JSON.parse(contents);
}

function partition_results(results: Evaluation[]): [Evaluation[], Evaluation[], Evaluation[]] {
    let test_results: Evaluation[] = [],
        wheat_results: Evaluation[] = [],
        chaff_results: Evaluation[] = [];

    let result: Evaluation;
    for (result of results) {
        if (result.code.includes("wheat")) { 
            wheat_results.push(result);

        } else if (result.code.includes("chaff")) { 
            chaff_results.push(result);

        } else { 
            test_results.push(result);
        }
    };

    return [test_results, wheat_results, chaff_results];
}

function read_score_data_from_file(path: PathName): PointData {
    let fs = require('fs');
    let contents: string = fs.readFileSync(path);
    let raw_score_data = JSON.parse(contents);
    return {
            functionality: new Map(raw_score_data.functionality),
            testing: new Map(raw_score_data.testing)
        };
}


/*********************\
*** Handling output ***
\*********************/

function write_report_to_file(path: PathName, report: GradescopeReport) {
    let fs = require('fs');
    let data: string = JSON.stringify(report);
    fs.writeFileSync(path, data);
    console.log("Wrote output to " + path);
}

/************************\
*** Generating reports ***
\************************/

//// Helpers

// Gets the name a file from path
function get_file_name(path_name: PathName): string {
    let path = require('path');
    return path.parse(path_name).base;
}

// Gets the name of a test or block from a location
function get_loc_name(loc: string): string {
    return loc.split("/")[-1];
}


// Generate student reports

function generate_functionality_report(test_result: Evaluation): GradescopeTestReport[] {
    // If errors, 0 functionality and provide error reason
    let result: Result = test_result.result;

    if (result.Err) {
        return [{
                name: get_file_name(test_result.code),
                score: 0,
                max_score: 1,
                output: `Error: ${result.Err}`,
                visibility: "visible"
            }];
    }


    // If no error, report what blocks passed/failed
    let reports: GradescopeTestReport[] = [];

    let block: TestBlock;
    for (block of result.Ok) {
        let report: GradescopeTestReport;
        if (block.error) {
            // If the block errors, then failed block
            report = {
                    name: block.name,
                    score: 0,
                    max_score: 1,
                    output: "Block errored.",
                    visibility: "after_published"
                };
        } else {
            // Otherwise, compare number of passed tests to total number of tests
            let total_tests: number = block.tests.length;
            let passed_tests: number = block.tests.filter(test => test.passed).length;
            report = {
                    name: block.name,
                    score: passed_tests === total_tests ? 1 : 0,
                    max_score: 1,
                    output: passed_tests === total_tests 
                        ? `Passed all ${total_tests} tests in this block!`
                        : `Missing ${total_tests - passed_tests} tests in this block`,
                    visibility: "after_published"
                };
        }

        // Add block to report
        reports.push(report);
    }

    return reports;
}

function get_invalid_tests_and_blocks(wheat: Evaluation): [[string, string][], [string, string][]] | null {
    if (wheat.result.Err) {
        return [[],[]];
    }

    let invalid_tests: [string, string][] = [];
    let invalid_blocks: [string, string][] = [];

    let block: TestBlock;
    for (block of wheat.result.Ok) {
        // If the block errors, add to invalid_blocks
        if (block.error) {
            invalid_blocks.push([get_loc_name(block.loc), block.name]);
        }

        let test: Test;
        for (test of block.tests) {
            // If a test fails, add to invalid_tests
            if (!test.passed) {
                invalid_tests.push([get_loc_name(test.loc), block.name]);
            }
        }
    }

    if ((invalid_tests.length === 0) && (invalid_blocks.length === 0)) {
        return null;
    } else {
        return [invalid_tests, invalid_blocks];
    }
}

function generate_wheat_report(wheat_result: Evaluation): GradescopeTestReport {
    let invalid: [[string, string][], [string, string][]] | null = 
        get_invalid_tests_and_blocks(wheat_result);

    let output: string;
    if (invalid === null) {
        output = "Passed wheat!";
    } else if (wheat_result.result.Err) {
        output = `Wheat errored; ${wheat_result.result.Err}`;
    } else {
        let [invalid_tests, invalid_blocks] = invalid;
        if (invalid_tests.length > 0) {
            output = `Wheat failed test in block ${invalid_tests[0][1]}`;
        } else if (invalid_blocks.length > 0) {
            output = `Wheat caused error in block ${invalid_blocks[0][1]}`;
        } else {
            throw "Wheat failed but no reason given.";
        }
    }

    return {
            name: get_file_name(wheat_result.code),
            score: (invalid === null) ? 1 : 0,
            max_score: 1,
            output: output,
            visibility: "after_published"
        }
}

function generate_chaff_report(wheat_results: Evaluation[]) {
    let all_invalid_tests: Set<string> = new Set(),
        all_invalid_blocks: Set<string> = new Set();

    let wheat_result: Evaluation;
    for (wheat_result of wheat_results) {
        let invalid: [[string, string][], [string, string][]] | null =
            get_invalid_tests_and_blocks(wheat_result);

        if (invalid !== null) {
            let invalid_test: [string, string];
            for (invalid_test of invalid[0]) {
                all_invalid_tests.add(invalid_test[0]);
            }

            let invalid_block: [string, string];
            for (invalid_block of invalid[1]) {
                all_invalid_blocks.add(invalid_block[0]);
            }
        }
    }

    return function (chaff_result: Evaluation): GradescopeTestReport {
        if (chaff_result.result.Err) {
            return {
                    name: get_file_name(chaff_result.code),
                    score: 1,
                    max_score: 1,
                    output: `Chaff caught; error: ${chaff_result.result.Err}!`,
                    visibility: "after_published"
                };
        } else {
            let block: TestBlock;
            for (block of chaff_result.result.Ok) {
                if (block.error) {
                    return {
                            name: get_file_name(chaff_result.code),
                            score: 1,
                            max_score: 1,
                            output: `Chaff caught; error in block ${block.name}!`,
                            visibility: "after_published"
                        }
                }

                let test: Test;
                for (test of block.tests) {
                    if (!test.passed) {
                        return {
                                name: get_file_name(chaff_result.code),
                                score: 1,
                                max_score: 1,
                                output: `Chaff caught; test failed in block ${block.name}!`,
                                visibility: "after_published"
                            }
                    }
                }
            }

            return {
                    name: get_file_name(chaff_result.code),
                    score: 0,
                    max_score: 1,
                    output: `Chaff not caught.`,
                    visibility: "after_published"
                }
        }
    }
}

// Generate TA reports

function generate_score_report(
        reports: GradescopeTestReport[],
        point_values: Map<string, number>,
        name: string): GradescopeTestReport {
    let total_score: number = 0,
        possible_score: number = 0;

    let report: GradescopeTestReport;
    for (report of reports) {
        let points = point_values.has(report.name) ? point_values.get(report.name) : 1;

        total_score += report.score === report.max_score ? points : 0;
        possible_score += points;
    }

    return {
            name: name,
            score: total_score,
            max_score: possible_score,
            output: "",
            visibility: "hidden"
        };
}

// Generate overall report

function generate_overall_report(
        all_reports: GradescopeTestReport[]): GradescopeReport {
    return {
            visibility: "after_published",
            stdout_visibility: "after_published",
            tests: all_reports,
        };
}

function main() {

    /*
    ** Handling input
    */

    // Get input and output file names from command line
    let [infile, outfile, scorefile]: [string, string, string] = parse_command_line();

    // Parse autograder json output
    let results: Evaluation[] = read_evaluation_from_file(infile);

    // Split up evaluations into test, wheat, and chaff results
    let [test_results, wheat_results, chaff_results]: [Evaluation[], Evaluation[], Evaluation[]] =
        partition_results(results);

    // Get point value data
    let point_values: PointData = read_score_data_from_file(scorefile);


    /*
    ** Generating reports
    */

    // Generate student reports

    // Functionality
    let functionality_reports: GradescopeTestReport[][] = 
        test_results.map(generate_functionality_report)

    // Wheats
    let wheat_reports: GradescopeTestReport[] =
        wheat_results.map(generate_wheat_report);

    // Chaffs
    let chaff_reports: GradescopeTestReport[] =
        chaff_results.map(generate_chaff_report(wheat_results));

    // Overview
    let student_reports: GradescopeTestReport[] = [].concat(
        ...functionality_reports,
        wheat_reports,
        chaff_reports,);


    // Generate TA reports

    // Functionality
    let functionality_scores: GradescopeTestReport[] = 
        functionality_reports.map(report => 
            generate_score_report(report, point_values.functionality, "Functionality score"));

    // Testing
    let wheat_score: GradescopeTestReport =
        generate_score_report(wheat_reports, point_values.testing, "Wheats score");

    let chaff_score: GradescopeTestReport =
        generate_score_report(chaff_reports, point_values.testing, "Chaffs score");

    // Overview
    let ta_reports: GradescopeTestReport[] = [].concat(
        functionality_scores, [
        wheat_score,
        chaff_score,],);


    // Generate overall report

    let all_reports: GradescopeTestReport[] = [].concat(student_reports, ta_reports)

    let gradescope_report: GradescopeReport = generate_overall_report(all_reports);


    /*
    ** Handling output
    */

    write_report_to_file(outfile, gradescope_report);
}

main();
