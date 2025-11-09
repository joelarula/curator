"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataUpdateWithWhereUniqueWithoutProjectInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataUpdateWithoutProjectInput_1 = require("../inputs/FileDataUpdateWithoutProjectInput");
const FileDataWhereUniqueInput_1 = require("../inputs/FileDataWhereUniqueInput");
let FileDataUpdateWithWhereUniqueWithoutProjectInput = class FileDataUpdateWithWhereUniqueWithoutProjectInput {
};
exports.FileDataUpdateWithWhereUniqueWithoutProjectInput = FileDataUpdateWithWhereUniqueWithoutProjectInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereUniqueInput_1.FileDataWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataWhereUniqueInput_1.FileDataWhereUniqueInput)
], FileDataUpdateWithWhereUniqueWithoutProjectInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpdateWithoutProjectInput_1.FileDataUpdateWithoutProjectInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataUpdateWithoutProjectInput_1.FileDataUpdateWithoutProjectInput)
], FileDataUpdateWithWhereUniqueWithoutProjectInput.prototype, "data", void 0);
exports.FileDataUpdateWithWhereUniqueWithoutProjectInput = FileDataUpdateWithWhereUniqueWithoutProjectInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataUpdateWithWhereUniqueWithoutProjectInput", {})
], FileDataUpdateWithWhereUniqueWithoutProjectInput);
