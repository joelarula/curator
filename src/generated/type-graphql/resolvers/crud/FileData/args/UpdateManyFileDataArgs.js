"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateManyFileDataArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataUpdateManyMutationInput_1 = require("../../../inputs/FileDataUpdateManyMutationInput");
const FileDataWhereInput_1 = require("../../../inputs/FileDataWhereInput");
let UpdateManyFileDataArgs = class UpdateManyFileDataArgs {
};
exports.UpdateManyFileDataArgs = UpdateManyFileDataArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpdateManyMutationInput_1.FileDataUpdateManyMutationInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataUpdateManyMutationInput_1.FileDataUpdateManyMutationInput)
], UpdateManyFileDataArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], UpdateManyFileDataArgs.prototype, "where", void 0);
exports.UpdateManyFileDataArgs = UpdateManyFileDataArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpdateManyFileDataArgs);
