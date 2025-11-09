"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataUpsertWithWhereUniqueWithoutProjectInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateWithoutProjectInput_1 = require("../inputs/FileDataCreateWithoutProjectInput");
const FileDataUpdateWithoutProjectInput_1 = require("../inputs/FileDataUpdateWithoutProjectInput");
const FileDataWhereUniqueInput_1 = require("../inputs/FileDataWhereUniqueInput");
let FileDataUpsertWithWhereUniqueWithoutProjectInput = class FileDataUpsertWithWhereUniqueWithoutProjectInput {
};
exports.FileDataUpsertWithWhereUniqueWithoutProjectInput = FileDataUpsertWithWhereUniqueWithoutProjectInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereUniqueInput_1.FileDataWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataWhereUniqueInput_1.FileDataWhereUniqueInput)
], FileDataUpsertWithWhereUniqueWithoutProjectInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpdateWithoutProjectInput_1.FileDataUpdateWithoutProjectInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataUpdateWithoutProjectInput_1.FileDataUpdateWithoutProjectInput)
], FileDataUpsertWithWhereUniqueWithoutProjectInput.prototype, "update", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateWithoutProjectInput_1.FileDataCreateWithoutProjectInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataCreateWithoutProjectInput_1.FileDataCreateWithoutProjectInput)
], FileDataUpsertWithWhereUniqueWithoutProjectInput.prototype, "create", void 0);
exports.FileDataUpsertWithWhereUniqueWithoutProjectInput = FileDataUpsertWithWhereUniqueWithoutProjectInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataUpsertWithWhereUniqueWithoutProjectInput", {})
], FileDataUpsertWithWhereUniqueWithoutProjectInput);
