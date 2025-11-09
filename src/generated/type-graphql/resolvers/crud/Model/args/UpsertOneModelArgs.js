"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpsertOneModelArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelCreateInput_1 = require("../../../inputs/ModelCreateInput");
const ModelUpdateInput_1 = require("../../../inputs/ModelUpdateInput");
const ModelWhereUniqueInput_1 = require("../../../inputs/ModelWhereUniqueInput");
let UpsertOneModelArgs = class UpsertOneModelArgs {
};
exports.UpsertOneModelArgs = UpsertOneModelArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereUniqueInput_1.ModelWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelWhereUniqueInput_1.ModelWhereUniqueInput)
], UpsertOneModelArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelCreateInput_1.ModelCreateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelCreateInput_1.ModelCreateInput)
], UpsertOneModelArgs.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelUpdateInput_1.ModelUpdateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelUpdateInput_1.ModelUpdateInput)
], UpsertOneModelArgs.prototype, "update", void 0);
exports.UpsertOneModelArgs = UpsertOneModelArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpsertOneModelArgs);
