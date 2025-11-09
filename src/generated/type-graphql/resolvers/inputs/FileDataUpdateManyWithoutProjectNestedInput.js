"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataUpdateManyWithoutProjectNestedInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateManyProjectInputEnvelope_1 = require("../inputs/FileDataCreateManyProjectInputEnvelope");
const FileDataCreateOrConnectWithoutProjectInput_1 = require("../inputs/FileDataCreateOrConnectWithoutProjectInput");
const FileDataCreateWithoutProjectInput_1 = require("../inputs/FileDataCreateWithoutProjectInput");
const FileDataScalarWhereInput_1 = require("../inputs/FileDataScalarWhereInput");
const FileDataUpdateManyWithWhereWithoutProjectInput_1 = require("../inputs/FileDataUpdateManyWithWhereWithoutProjectInput");
const FileDataUpdateWithWhereUniqueWithoutProjectInput_1 = require("../inputs/FileDataUpdateWithWhereUniqueWithoutProjectInput");
const FileDataUpsertWithWhereUniqueWithoutProjectInput_1 = require("../inputs/FileDataUpsertWithWhereUniqueWithoutProjectInput");
const FileDataWhereUniqueInput_1 = require("../inputs/FileDataWhereUniqueInput");
let FileDataUpdateManyWithoutProjectNestedInput = class FileDataUpdateManyWithoutProjectNestedInput {
};
exports.FileDataUpdateManyWithoutProjectNestedInput = FileDataUpdateManyWithoutProjectNestedInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataCreateWithoutProjectInput_1.FileDataCreateWithoutProjectInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataUpdateManyWithoutProjectNestedInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataCreateOrConnectWithoutProjectInput_1.FileDataCreateOrConnectWithoutProjectInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataUpdateManyWithoutProjectNestedInput.prototype, "connectOrCreate", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataUpsertWithWhereUniqueWithoutProjectInput_1.FileDataUpsertWithWhereUniqueWithoutProjectInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataUpdateManyWithoutProjectNestedInput.prototype, "upsert", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateManyProjectInputEnvelope_1.FileDataCreateManyProjectInputEnvelope, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataCreateManyProjectInputEnvelope_1.FileDataCreateManyProjectInputEnvelope)
], FileDataUpdateManyWithoutProjectNestedInput.prototype, "createMany", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataWhereUniqueInput_1.FileDataWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataUpdateManyWithoutProjectNestedInput.prototype, "set", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataWhereUniqueInput_1.FileDataWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataUpdateManyWithoutProjectNestedInput.prototype, "disconnect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataWhereUniqueInput_1.FileDataWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataUpdateManyWithoutProjectNestedInput.prototype, "delete", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataWhereUniqueInput_1.FileDataWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataUpdateManyWithoutProjectNestedInput.prototype, "connect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataUpdateWithWhereUniqueWithoutProjectInput_1.FileDataUpdateWithWhereUniqueWithoutProjectInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataUpdateManyWithoutProjectNestedInput.prototype, "update", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataUpdateManyWithWhereWithoutProjectInput_1.FileDataUpdateManyWithWhereWithoutProjectInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataUpdateManyWithoutProjectNestedInput.prototype, "updateMany", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataScalarWhereInput_1.FileDataScalarWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataUpdateManyWithoutProjectNestedInput.prototype, "deleteMany", void 0);
exports.FileDataUpdateManyWithoutProjectNestedInput = FileDataUpdateManyWithoutProjectNestedInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataUpdateManyWithoutProjectNestedInput", {})
], FileDataUpdateManyWithoutProjectNestedInput);
